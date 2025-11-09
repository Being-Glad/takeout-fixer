<div align="center">
  <svg width="128" height="128" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="20" fill="#111827"/>
    <rect x="25" y="25" width="20" height="20" rx="3" fill="#a855f7"/>
    <rect x="55" y="25" width="20" height="20" rx="3" fill="#6d28d9"/>
    <rect x="25" y="55" width="50" height="20" rx="3" fill="#4f46e5"/>
  </svg>
  <h1>Takeout Date Fixer</h1>
  <p><strong>Get your memories back in order.</strong></p>
  <p>
    <a href="https://github.com/Being-Glad/takeout-fixer/releases/latest"><img src="https://img.shields.io/github/v/release/Being-Glad/takeout-fixer?style=for-the-badge" alt="Latest Release"></a>
    <a href="https://github.com/Being-Glad/takeout-fixer/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Being-Glad/takeout-fixer?style=for-the-badge" alt="License"></a>
    <a href="https://github.com/Being-Glad/takeout-fixer/issues"><img src="https://img.shields.io/github/issues/Being-Glad/takeout-fixer?style=for-the-badge" alt="Issues"></a>
  </p>
</div>

---

When you export your library from Google Takeout, all your original "Date Taken" metadata is stripped from the image files and put into separate `.json` files. This leaves your photo library in a complete mess, with every photo dated on the day you downloaded it.

**Takeout Date Fixer** is a 100% free, open-source tool that reads those JSON files and puts the correct date, GPS location, and descriptions back into your photos and videos—permanently.

It comes in two versions: a simple web app for quick jobs, and a powerful desktop app for your entire library.

## ✨ Features

| Feature | Quick-Fix (Web) | Free Desktop App (Pro) |
|:--- |:---:|:---:|
| **Fix Sort Order** (File Date) | ✅ | ✅ |
| **Write Permanent EXIF Data** | ❌ | ✅ |
| **Restore GPS Location** | ❌ | ✅ |
| **Restore Captions/Descriptions** | ❌ | ✅ |
| **File Size Limit** | ~5GB (Browser Limit) | Unlimited |
| **Runs 100% Offline** | ✅ | ✅ |
| **Smart Date Fallback** (from filename) | ✅ | ✅ |

## 🚀 Two Ways to Fix

### 1. Quick-Fix · On the Go (Web App)
For small batches and quick jobs. No installation required.
> **➡️ [Launch the Web App](https://Being-Glad.github.io/takeout-fixer/)**

This version runs entirely in your browser. It fixes the "Date Modified" so your files sort correctly, then bundles them in a `.zip` for you to download.

### 2. Free Desktop App (Recommended)
For unlimited power, permanent fixes, and large libraries. This is the recommended solution for archiving your photos or importing them into apps like Apple Photos or Google Photos.

The desktop app writes the original date, GPS, and descriptions directly into the file's permanent EXIF metadata.

## 💻 Downloads

The Desktop App is 100% free, open-source, and runs entirely offline. Your photos never leave your computer.

<div align="center">

<a href="https://github.com/Being-Glad/takeout-fixer/releases/latest/download/Takeout-Date-Fixer.exe" style="text-decoration:none;">
  <img src="https://img.shields.io/badge/Download_for-Windows-blue?style=for-the-badge&logo=windows" alt="Download for Windows">
</a>
&nbsp;&nbsp;
<a href="https://github.com/Being-Glad/takeout-fixer/releases/latest/download/Takeout-Date-Fixer.dmg" style="text-decoration:none;">
  <img src="https://img.shields.io/badge/Download_for-macOS_(Universal)-lightgrey?style=for-the-badge&logo=apple" alt="Download for macOS">
</a>
&nbsp;&nbsp;
<a href="https://github.com/Being-Glad/takeout-fixer/releases/latest/download/Takeout-Date-Fixer.AppImage" style="text-decoration:none;">
  <img src="https://img.shields.io/badge/Download_for-Linux-yellow?style=for-the-badge&logo=linux" alt="Download for Linux">
</a>

</div>

---

### A Note for Mac Users (Gatekeeper)
On macOS, you may see a warning that says *"Apple could not verify..."* because this is a free app from an independent developer.

**To open it the first time:**
1.  **Right-click** (or Control-click) the app icon.
2.  Select **Open** from the menu.
3.  A new dialog will appear. Click **Open** again.
You only have to do this once.

## 🤔 Frequently Asked Questions

**Why do I need this?**
> When you download from Google Takeout, Google separates the metadata (date, location) into JSON files. This tool reads them and puts the correct info back, so your photos don't all show today's date.

**Is it safe?**
> Yes. Both the web and desktop versions process your files 100% locally on your device. Your photos never leave your computer. The code is fully open-source for transparency.

**What's the difference between the Web app and the Desktop app?**
> The **Quick-Fix (Web)** app is for small batches (<5GB) and only fixes file sorting dates (Date Modified). The **Desktop App** has no size limit and permanently writes true EXIF/GPS data into the files themselves.

**Will this create duplicates?**
> The **Desktop App** modifies your files *in-place*, so no duplicates are created. The **Web App** creates a new `.zip` file with your fixed photos, leaving your originals untouched.

**Works with Apple Photos / Google Photos?**
> Yes! Use the **Desktop App** to process your files *first*. Then, when you import them into Apple Photos, Google Photos, or any other gallery, they will appear in the correct chronological order with all location data intact.

**How fast is it?**
> Extremely fast. The desktop app can process thousands of photos per minute because it runs locally on your computer's full power.

## ☕ Support the Project

If you find this tool useful, please consider supporting its future development.

<a href="https://buymeacoffee.com/Being_Glad" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50">
</a>

## 📜 License

This project is licensed under the MIT License. See the `LICENSE` file for details.