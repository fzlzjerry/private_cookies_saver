document.addEventListener('DOMContentLoaded', async () => {
  const saveCookiesBtn = document.getElementById('saveCookies');
  const restoreCookiesBtn = document.getElementById('restoreCookies');
  const fileInput = document.getElementById('fileInput');
  const fileLabel = document.querySelector('.file-label');
  const statusDiv = document.getElementById('status');
  
  let selectedCookies = null;

  function showStatus(message, isError = false, details = null) {
    let displayMessage = message;
    
    if (isError && details) {
      if (details.errors && Array.isArray(details.errors)) {
        // If there are specific cookie errors
        const failedCount = details.errors.length;
        displayMessage = `${message}\nFailed count: ${failedCount}`;
        
        // Show detailed error information in console
        console.group('Cookie Setting Failures:');
        details.errors.forEach((error, index) => {
          console.log(`${index + 1}. ${error.cookie.name}@${error.cookie.domain}: ${error.error}`);
        });
        console.groupEnd();
      } else if (details.total && details.failed) {
        // If there are overall statistics
        displayMessage = `${message}\nSuccess: ${details.success}, Failed: ${details.failed}`;
      }
      
      // Show complete error details in console
      console.error('Detailed error information:', details);
    }

    statusDiv.innerHTML = displayMessage.replace(/\n/g, '<br>');
    statusDiv.className = `status ${isError ? 'error' : 'success'}`;
    
    // Extended display time for error messages
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status';
    }, isError ? 8000 : 3000);  // Show errors for 8 seconds
  }

  // Check if in incognito mode
  chrome.windows.getCurrent((window) => {
    if (!window.incognito) {
      saveCookiesBtn.disabled = true;
      restoreCookiesBtn.disabled = true;
      fileLabel.classList.add('disabled');
      showStatus("This extension can only be used in incognito mode", true);
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
            fileLabel.textContent = `${file.name} (${cookies.length} cookies)`;
            showStatus(`Cookie file selected\nContains ${cookies.length} cookies`);
          } else {
            throw new Error("Invalid cookie file format");
          }
        } catch (error) {
          console.error('Error reading file:', error);
          showStatus("Invalid cookie file format", true, {
            error: error.message,
            file: file.name
          });
          fileLabel.classList.remove('selected');
          selectedCookies = null;
        }
      };
      
      reader.onerror = (error) => {
        showStatus("Error reading file", true, {
          error: error.message,
          file: file.name
        });
        fileLabel.classList.remove('selected');
        selectedCookies = null;
      };
      
      reader.readAsText(file);
    });

    saveCookiesBtn.addEventListener('click', () => {
      saveCookiesBtn.disabled = true;
      showStatus("Saving cookies...");
      
      chrome.runtime.sendMessage({ action: 'saveCookies' }, (response) => {
        saveCookiesBtn.disabled = false;
        if (response.success) {
          showStatus(response.message);
        } else {
          showStatus(response.message, true, {
            error: response.error,
            details: response.details
          });
        }
      });
    });

    restoreCookiesBtn.addEventListener('click', () => {
      if (!selectedCookies) {
        showStatus("Please select a cookie file first", true);
        return;
      }

      restoreCookiesBtn.disabled = true;
      showStatus("Restoring cookies...");

      chrome.runtime.sendMessage({ 
        action: 'restoreCookies',
        cookies: selectedCookies
      }, (response) => {
        restoreCookiesBtn.disabled = false;
        if (response.success) {
          showStatus(
            response.message,
            false,
            response.details
          );
          if (response.details) {
            console.log('Restore details:', response.details);
          }
        } else {
          showStatus(
            response.message, 
            true, 
            response.details || { error: response.error }
          );
        }
      });
    });
  });
}); 