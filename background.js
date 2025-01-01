// Check if in incognito mode
async function checkIncognitoMode() {
  return new Promise((resolve) => {
    chrome.windows.getCurrent((window) => {
      resolve(window.incognito);
    });
  });
}

// Get all cookies from all domains
async function getAllCookies() {
  return new Promise((resolve, reject) => {
    try {
      chrome.cookies.getAll({}, (cookies) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Failed to get cookies: ${chrome.runtime.lastError.message}`));
          return;
        }
        console.log(`Successfully retrieved ${cookies.length} cookies`);
        resolve(cookies);
      });
    } catch (error) {
      reject(new Error(`Exception while getting cookies: ${error.message}`));
    }
  });
}

// Delete specified cookie
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

// Set cookie
async function setCookie(cookie) {
  try {
    const protocol = cookie.secure ? "https:" : "http:";
    let domain = cookie.domain;
    
    // Handle leading dot in domain
    if (domain.startsWith('.')) {
      domain = domain.substring(1);
    }
    
    const url = `${protocol}//${domain}${cookie.path}`;
    console.log(`Attempting to set cookie: ${cookie.name}@${domain} (${url})`);
    
    // Prepare cookie settings
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

    // Remove undefined properties
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
                const errorMsg = chrome.runtime.lastError.message;
                console.warn(`Attempt ${retryCount + 1}: Failed to set cookie:`, {
                  name: cookie.name,
                  domain: cookie.domain,
                  error: errorMsg,
                  details: cookieDetails
                });
                res({ success: false, error: errorMsg });
              } else {
                console.log(`Successfully set cookie: ${cookie.name}@${domain}`);
                res({ success: true, details });
              }
            });
          });

          if (result.success) {
            resolve(result.details);
          } else if (retryCount < maxRetries) {
            retryCount++;
            // Modify retry strategy
            if (retryCount === 1) {
              // First retry: remove sameSite
              delete cookieDetails.sameSite;
              console.log(`Retry ${retryCount}: Removed sameSite attribute - ${cookie.name}`);
            } else if (retryCount === 2) {
              // Second retry: set to no_restriction
              cookieDetails.sameSite = 'no_restriction';
              console.log(`Retry ${retryCount}: Set sameSite to no_restriction - ${cookie.name}`);
            } else if (retryCount === 3) {
              // Third retry: remove domain, use url only
              delete cookieDetails.domain;
              console.log(`Retry ${retryCount}: Removed domain attribute - ${cookie.name}`);
            }
            
            await trySetCookie();
          } else {
            const errorInfo = {
              cookie: {
                name: cookie.name,
                domain: cookie.domain,
                path: cookie.path
              },
              lastError: result.error,
              attempts: retryCount + 1,
              finalConfig: cookieDetails
            };
            console.error('Failed to set cookie after all retries:', errorInfo);
            resolve(null);
          }
        } catch (error) {
          console.error('Exception while setting cookie:', {
            cookie: {
              name: cookie.name,
              domain: cookie.domain
            },
            error: error.message,
            stack: error.stack
          });
          resolve(null);
        }
      };

      await trySetCookie();
    });
  } catch (error) {
    console.error('Critical error while setting cookie:', {
      cookie: {
        name: cookie.name,
        domain: cookie.domain
      },
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Save cookies to file
async function saveCookiesToFile(cookies) {
  try {
    // Filter out invalid cookies
    const validCookies = cookies.filter(cookie => 
      cookie && cookie.domain && cookie.name && cookie.value
    );

    console.log(`${validCookies.length} valid cookies after filtering`);

    // Add extra metadata for debugging
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
          console.error('Error downloading file:', chrome.runtime.lastError);
          reject(new Error(`Failed to save file: ${chrome.runtime.lastError.message}`));
        } else {
          resolve(downloadId);
        }
      });
    });
  } catch (error) {
    console.error('Error creating file:', error);
    throw new Error(`Failed to create cookie file: ${error.message}`);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveCookies") {
    checkIncognitoMode().then(async (isIncognito) => {
      if (!isIncognito) {
        sendResponse({ success: false, message: "This extension can only be used in incognito mode" });
        return;
      }

      try {
        console.log('Starting to get cookies...');
        const cookies = await getAllCookies();
        console.log('Starting to save cookies to file...');
        await saveCookiesToFile(cookies);
        console.log('Cookies saved successfully');
        sendResponse({ success: true, message: "Cookies have been saved to file" });
      } catch (error) {
        console.error('Error saving cookies:', error);
        sendResponse({ 
          success: false, 
          message: `Error saving cookies: ${error.message}`,
          error: error.message 
        });
      }
    });
    return true;
  }
  
  if (request.action === "restoreCookies") {
    checkIncognitoMode().then(async (isIncognito) => {
      if (!isIncognito) {
        sendResponse({ success: false, message: "This extension can only be used in incognito mode" });
        return;
      }

      try {
        const cookies = request.cookies;
        if (!cookies || cookies.length === 0) {
          sendResponse({ success: false, message: "No cookies found to restore" });
          return;
        }
        
        console.log(`Preparing to restore ${cookies.length} cookies...`);
        
        // Clear current cookies first
        const currentCookies = await getAllCookies();
        console.log(`Clearing current ${currentCookies.length} cookies...`);
        for (const cookie of currentCookies) {
          await removeCookie(cookie);
        }
        
        // Restore saved cookies
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        
        // Group cookies by domain
        const cookiesByDomain = {};
        cookies.forEach(cookie => {
          const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
          if (!cookiesByDomain[domain]) {
            cookiesByDomain[domain] = [];
          }
          cookiesByDomain[domain].push(cookie);
        });

        // Restore cookies by domain
        for (const [domain, domainCookies] of Object.entries(cookiesByDomain)) {
          console.log(`Restoring ${domainCookies.length} cookies for domain ${domain}...`);
          for (const cookie of domainCookies) {
            try {
              const result = await setCookie(cookie);
              if (result) {
                successCount++;
              } else {
                throw new Error('Failed to set cookie');
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
              console.error('Failed to restore cookie:', cookie, error);
            }
          }
        }
        
        console.log(`Restore completed: success=${successCount}, failed=${errorCount}`);
        
        if (successCount === 0) {
          sendResponse({ 
            success: false, 
            message: "Failed to restore any cookies",
            details: { errors }
          });
        } else if (successCount < cookies.length) {
          sendResponse({ 
            success: true, 
            message: `Partially restored cookies (${successCount}/${cookies.length})`,
            details: { 
              total: cookies.length,
              success: successCount,
              failed: errorCount,
              errors 
            }
          });
        } else {
          sendResponse({ success: true, message: "All cookies have been restored" });
        }
      } catch (error) {
        console.error('Error restoring cookies:', error);
        sendResponse({ 
          success: false, 
          message: `Error restoring cookies: ${error.message}`,
          error: error.message
        });
      }
    });
    return true;
  }
}); 