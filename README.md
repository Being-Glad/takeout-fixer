<div align="center">
<svg width="128" height="128" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="100" height="100" rx="20" fill="#111827"/>
<rect x="25" y="25" width="20" height="20" rx="3" fill="#a855f7"/>
<rect x="55" y="25" width="20" height="20" rx="3" fill="#6d28d9"/>
<rect x="25" y="55" width="50" height="20" rx="3" fill="#4f46e5"/>
</svg>

<h1 style="font-size: 3em; margin-top: 0.5em; margin-bottom: 0.2em;">PhotoTakeout Fixer</h1>
<p style="font-size: 1.25em;"><strong>Get your memories back in order.</strong></p>

<p>
<a href="https://github.com/Being-Glad/takeout-fixer/releases/latest"><img src="https://img.shields.io/github/v/release/Being-Glad/takeout-fixer?style=for-the-badge&label=Latest%20Release" alt="Latest Release"></a>
<a href="https://github.com/Being-Glad/takeout-fixer/blob/main/LICENSE"><img src="https://www.google.com/search?q=https://img.shields.io/github/license/Being-Glad/takeout-fixer%3Fstyle%3Dfor-the-badge%26color%3Dblue" alt="License"></a>
<a href="https://github.com/Being-Glad/takeout-fixer/issues"><img src="https://www.google.com/search?q=https://img.shields.io/github/issues/Being-Glad/takeout-fixer%3Fstyle%3Dfor-the-badge%26color%3Dgreen" alt="Issues"></a>
</p>
</div>

PhotoTakeout Fixer is a free, open-source app that restores dates, GPS locations, and descriptions to photos and videos downloaded from Google Takeout.

When you export your library from Google Photos, Google strips this critical EXIF metadata and puts it in separate .json files. This app is the solution: it reads those .json files and perfectly writes the data back into your media files.

This ensures your entire photo library is perfectly organized (with correct dates, locations, and captions) when you import it into Apple Photos, Plex, or any other photo gallery.

Features

Fixes Dates & Times: Restores the original "Date Taken" (EXIF DateTimeOriginal) to all photos and videos.

Fixes GPS Locations: Re-embeds latitude and longitude data so your photos appear on a map.

Fixes Descriptions: Restores your original captions and descriptions, writing them to Description and UserComment tags.

Handles Mismatches: Intelligently matches files even if they have suffixes like (1), -edited, or -collage.

Preserves Album Structure: "Merge" and "Zip" modes create a perfect copy of your Takeout folder structure (e.g., Photos from 2017/My Album/).

Safe & Offline: The desktop app runs 100% locally. Your photos never leave your computer.

Cross-Platform: Works on Windows, macOS (Intel & Apple Silicon), and Linux.

How to Use

Desktop App (Recommended)

The desktop app is the full-power solution with no file size limits. It can fix files "In-Place" (modifying them directly) or create a new "Merged" folder or "Zip" file.

Download the latest release for your OS from the Releases Page.

Open the app.

Click "Browse Folder..." and select your main Takeout folder (the one containing all your year folders like Photos from 2023, Photos from 2022, etc.).

Choose your mode:

Fix In-Place: Modifies your original files. Fastest, no extra space needed.

Merge to New Folder: Creates a new, clean copy of your fixed library in a folder you select.

Create Zip Archive: Creates a single .zip file of your fixed library.

Click "Start Fixing" and let it run.

Web App (Quick Fix)

The web app runs in your browser and is for small jobs (under 5GB). It only fixes the file timestamp for sorting; it does not write permanent EXIF data.

Go to the web app.

Drag & Drop your unzipped Takeout folder.

Download the fixed .zip files.

FAQ

Why do I need this?

Google Takeout separates metadata (date, location, description) into .json files. If you import your photos directly, they will all show "today's date." This tool fixes that.

Is it safe?

Yes. It is 100% safe. All processing happens <span class="font-semibold">entirely on your device</span>. The code is open-source for transparency.

Web App vs Desktop App?

The Web App is for small batches (<5GB) and only fixes sorting dates. The Desktop App has unlimited size and permanently writes true EXIF/GPS/Description data into the files themselves.

Will this create duplicates?

The Desktop App's "Fix In-Place" mode modifies files <span class="font-semibold">in-place</span>, so NO duplicates are created. The other modes create new fixed files, leaving your originals untouched.

Works with Apple Photos / Other Galleries?

Yes! Use the Desktop App to process your files first. Then, when you import them into Apple Photos or any other gallery, they will appear in the correct chronological order with all location data and descriptions intact.

How fast is it?

Extremely fast. It can process thousands of photos per minute because it runs locally on your computer's full power, not on a slow server.

☕ Support the Project

If you find this tool useful, please consider supporting its future development.

<a href="https://buymeacoffee.com/Being_Glad" target="_blank">
<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50">
</a>

📜 License

This project is licensed under the MIT License.