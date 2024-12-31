// 检查是否在隐私模式下
async function checkIncognitoMode() {
  return new Promise((resolve) => {
    chrome.windows.getCurrent((window) => {
      resolve(window.incognito);
    });
  });
}

// 保存所有域名的cookies
async function getAllCookies() {
  return new Promise((resolve, reject) => {
    try {
      chrome.cookies.getAll({}, (cookies) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`获取Cookies失败: ${chrome.runtime.lastError.message}`));
          return;
        }
        console.log(`成功获取 ${cookies.length} 个cookies`);
        resolve(cookies);
      });
    } catch (error) {
      reject(new Error(`获取Cookies时发生异常: ${error.message}`));
    }
  });
}

// 删除指定cookie
async function removeCookie(cookie) {
  const protocol = cookie.secure ? "https:" : "http:";
  const url = `${protocol}//${cookie.domain}${cookie.path}`;
  
  return new Promise((resolve) => {
    chrome.cookies.remove({
      url: url,
      name: cookie.name,
      storeId: cookie.storeId
    }, (details) => {
      resolve(details);
    });
  });
}

// 设置cookie
async function setCookie(cookie) {
  try {
    const protocol = cookie.secure ? "https:" : "http:";
    let domain = cookie.domain;
    
    // 处理域名前的点号
    if (domain.startsWith('.')) {
      domain = domain.substring(1);
    }
    
    const url = `${protocol}//${domain}${cookie.path}`;
    
    // 准备cookie设置
    const cookieDetails = {
      url: url,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite === 'unspecified' ? undefined : cookie.sameSite,
      expirationDate: cookie.expirationDate || (Date.now() / 1000 + 365 * 24 * 60 * 60)
    };

    // 移除undefined的属性
    Object.keys(cookieDetails).forEach(key => 
      cookieDetails[key] === undefined && delete cookieDetails[key]
    );

    return new Promise(async (resolve) => {
      let retryCount = 0;
      const maxRetries = 3;
      
      const trySetCookie = async () => {
        try {
          const result = await new Promise((res) => {
            chrome.cookies.set(cookieDetails, (details) => {
              if (chrome.runtime.lastError) {
                console.warn(`尝试 ${retryCount + 1}: 设置cookie失败: ${cookie.name}@${cookie.domain}`, chrome.runtime.lastError);
                res(null);
              } else {
                res(details);
              }
            });
          });

          if (result) {
            resolve(result);
          } else if (retryCount < maxRetries) {
            retryCount++;
            // 修改重试策略
            if (retryCount === 1) {
              // 第一次重试：移除 sameSite
              delete cookieDetails.sameSite;
            } else if (retryCount === 2) {
              // 第二次重试：设置为 no_restriction
              cookieDetails.sameSite = 'no_restriction';
            } else if (retryCount === 3) {
              // 第三次重试：移除 domain，仅使用 url
              delete cookieDetails.domain;
            }
            
            console.log(`重试第 ${retryCount} 次设置cookie: ${cookie.name}`);
            await trySetCookie();
          } else {
            console.error(`设置cookie失败，已重试${maxRetries}次:`, cookie.name, cookie.domain);
            resolve(null);
          }
        } catch (error) {
          console.error('设置cookie时发生错误:', error);
          resolve(null);
        }
      };

      await trySetCookie();
    });
  } catch (error) {
    console.error('设置cookie时发生错误:', error);
    throw error;
  }
}

// 保存cookies到文件
async function saveCookiesToFile(cookies) {
  try {
    // 过滤掉可能的无效cookie
    const validCookies = cookies.filter(cookie => 
      cookie && cookie.domain && cookie.name && cookie.value
    );

    console.log(`过滤后剩余 ${validCookies.length} 个有效cookies`);

    // 为每个cookie添加额外信息以便调试
    const cookiesWithMeta = validCookies.map(cookie => ({
      ...cookie,
      _meta: {
        timestamp: new Date().toISOString(),
        source: self.location?.origin || 'chrome-extension'
      }
    }));

    const jsonString = JSON.stringify(cookiesWithMeta, null, 2);
    const dataUrl = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(jsonString)));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    return new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: dataUrl,
        filename: `cookies-${timestamp}.json`,
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('下载文件时出错:', chrome.runtime.lastError);
          reject(new Error(`保存文件失败: ${chrome.runtime.lastError.message}`));
        } else {
          resolve(downloadId);
        }
      });
    });
  } catch (error) {
    console.error('创建文件时出错:', error);
    throw new Error(`创建Cookie文件失败: ${error.message}`);
  }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveCookies") {
    checkIncognitoMode().then(async (isIncognito) => {
      if (!isIncognito) {
        sendResponse({ success: false, message: "只能在隐私模式下使用" });
        return;
      }

      try {
        console.log('开始获取cookies...');
        const cookies = await getAllCookies();
        console.log('开始保存cookies到文件...');
        await saveCookiesToFile(cookies);
        console.log('Cookies保存成功');
        sendResponse({ success: true, message: "Cookies已保存到文件" });
      } catch (error) {
        console.error('保存Cookies时发生错误:', error);
        sendResponse({ 
          success: false, 
          message: `保存Cookies时发生错误: ${error.message}`,
          error: error.message 
        });
      }
    });
    return true;
  }
  
  if (request.action === "restoreCookies") {
    checkIncognitoMode().then(async (isIncognito) => {
      if (!isIncognito) {
        sendResponse({ success: false, message: "只能在隐私模式下使用" });
        return;
      }

      try {
        const cookies = request.cookies;
        if (!cookies || cookies.length === 0) {
          sendResponse({ success: false, message: "没有找到要恢复的Cookies" });
          return;
        }
        
        console.log(`准备恢复 ${cookies.length} 个cookies...`);
        
        // 先清除当前所有cookies
        const currentCookies = await getAllCookies();
        console.log(`清除当前的 ${currentCookies.length} 个cookies...`);
        for (const cookie of currentCookies) {
          await removeCookie(cookie);
        }
        
        // 恢复保存的cookies
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        
        // 按域名分组cookies
        const cookiesByDomain = {};
        cookies.forEach(cookie => {
          const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
          if (!cookiesByDomain[domain]) {
            cookiesByDomain[domain] = [];
          }
          cookiesByDomain[domain].push(cookie);
        });

        // 按域名顺序恢复cookies
        for (const [domain, domainCookies] of Object.entries(cookiesByDomain)) {
          console.log(`正在恢复域名 ${domain} 的 ${domainCookies.length} 个cookies...`);
          for (const cookie of domainCookies) {
            try {
              const result = await setCookie(cookie);
              if (result) {
                successCount++;
              } else {
                throw new Error('Cookie设置失败');
              }
            } catch (error) {
              errorCount++;
              errors.push({
                cookie: {
                  name: cookie.name,
                  domain: cookie.domain,
                  path: cookie.path
                },
                error: error.message
              });
              console.error('恢复cookie失败:', cookie, error);
            }
          }
        }
        
        console.log(`恢复完成: 成功=${successCount}, 失败=${errorCount}`);
        
        if (successCount === 0) {
          sendResponse({ 
            success: false, 
            message: "没有成功恢复任何Cookies",
            details: { errors }
          });
        } else if (successCount < cookies.length) {
          sendResponse({ 
            success: true, 
            message: `部分Cookies已恢复 (${successCount}/${cookies.length})`,
            details: { 
              total: cookies.length,
              success: successCount,
              failed: errorCount,
              errors 
            }
          });
        } else {
          sendResponse({ success: true, message: "所有Cookies已恢复" });
        }
      } catch (error) {
        console.error('恢复Cookies时发生错误:', error);
        sendResponse({ 
          success: false, 
          message: `恢复Cookies时发生错误: ${error.message}`,
          error: error.message
        });
      }
    });
    return true;
  }
}); 