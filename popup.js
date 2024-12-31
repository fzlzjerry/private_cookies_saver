document.addEventListener('DOMContentLoaded', async () => {
  const saveCookiesBtn = document.getElementById('saveCookies');
  const restoreCookiesBtn = document.getElementById('restoreCookies');
  const fileInput = document.getElementById('fileInput');
  const fileLabel = document.querySelector('.file-label');
  const statusDiv = document.getElementById('status');
  
  let selectedCookies = null;

  function showStatus(message, isError = false, details = null) {
    statusDiv.textContent = message;
    if (details) {
      console.error('详细错误信息:', details);
    }
    statusDiv.className = `status ${isError ? 'error' : 'success'}`;
    // 错误信息显示时间延长
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status';
    }, isError ? 5000 : 3000);
  }

  // 检查是否在隐私模式下
  chrome.windows.getCurrent((window) => {
    if (!window.incognito) {
      saveCookiesBtn.disabled = true;
      restoreCookiesBtn.disabled = true;
      fileLabel.classList.add('disabled');
      showStatus("此扩展只能在隐私模式下使用", true);
      return;
    }

    fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) {
        fileLabel.classList.remove('selected');
        selectedCookies = null;
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const cookies = JSON.parse(e.target.result);
          if (Array.isArray(cookies)) {
            selectedCookies = cookies;
            fileLabel.classList.add('selected');
            fileLabel.textContent = file.name;
            showStatus(`已选择Cookie文件 (包含 ${cookies.length} 个cookies)`);
          } else {
            throw new Error("无效的Cookie文件格式");
          }
        } catch (error) {
          console.error('读取文件错误:', error);
          showStatus("无效的Cookie文件", true, error);
          fileLabel.classList.remove('selected');
          selectedCookies = null;
        }
      };
      
      reader.onerror = (error) => {
        showStatus("读取文件时发生错误", true, error);
        fileLabel.classList.remove('selected');
        selectedCookies = null;
      };
      
      reader.readAsText(file);
    });

    saveCookiesBtn.addEventListener('click', () => {
      saveCookiesBtn.disabled = true;
      showStatus("正在保存Cookies...");
      
      chrome.runtime.sendMessage({ action: 'saveCookies' }, (response) => {
        saveCookiesBtn.disabled = false;
        if (response.success) {
          showStatus(response.message);
        } else {
          showStatus(response.message, true, response.error);
        }
      });
    });

    restoreCookiesBtn.addEventListener('click', () => {
      if (!selectedCookies) {
        showStatus("请先选择Cookie文件", true);
        return;
      }

      restoreCookiesBtn.disabled = true;
      showStatus("正在恢复Cookies...");

      chrome.runtime.sendMessage({ 
        action: 'restoreCookies',
        cookies: selectedCookies
      }, (response) => {
        restoreCookiesBtn.disabled = false;
        if (response.success) {
          showStatus(response.message);
          if (response.details) {
            console.log('恢复详情:', response.details);
          }
        } else {
          showStatus(response.message, true, response.details || response.error);
        }
      });
    });
  });
}); 