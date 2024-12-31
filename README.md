# Private Cookies Saver

A Chrome extension for saving and restoring cookies from private browsing sessions.

## Features

- Save current browsing session cookies to JSON file
- Restore previously saved cookies from JSON file
- Support for private browsing mode
- Simple and intuitive user interface

## Installation

1. Download or clone this repository
2. Open Chrome browser and navigate to the extensions page (`chrome://extensions/`)
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked extension"
5. Select the repository directory

## Usage

1. Click the extension icon in the Chrome toolbar to open the interface
2. Click "Save Cookies" to save current session cookies to a file
3. When needed, click "Choose File" to select a previously saved cookies file
4. Click "Restore Cookies" to restore the saved cookies to the browser

## Permissions

This extension requires the following permissions:
- `cookies`: For reading and modifying cookies
- `storage`: For storing extension settings
- `tabs`: For accessing current tab information
- `activeTab`: For interacting with the active tab
- `downloads`: For downloading cookies files

## Tech Stack

- Chrome Extension Manifest V3
- HTML/CSS/JavaScript
- Chrome Extension APIs

## Privacy

- All data is stored locally
- No data is sent to any servers
- Cookies data is saved in encrypted format

## License

MIT License 