# Deadman's Drop - User Manual

A guide to using the Deadman's Drop mobile application for recording, managing, and distributing videos on a dead man's switch timer.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Getting Started](#2-getting-started)
3. [Login](#3-login)
4. [Recording a Video](#4-recording-a-video)
5. [Managing Videos](#5-managing-videos)
6. [Check-In (Resetting the Timer)](#6-check-in-resetting-the-timer)
7. [Distribution Recipients](#7-distribution-recipients)
8. [Settings](#8-settings)
9. [Notifications](#9-notifications)
10. [Video Lifecycle](#10-video-lifecycle)
11. [Frequently Asked Questions](#11-frequently-asked-questions)

---

## 1. Overview

Deadman's Drop is a self-hosted video recording and dead man's switch distribution system. You record videos on your mobile device and they are automatically uploaded to your private server. Unless you check in within a configurable time period (default: 7 days), your videos are automatically distributed to a predefined list of recipients.

**Key concepts:**

- **Distribution timer**: A countdown (1-30 days) that starts when you upload a video. If it reaches zero without a check-in, the video is distributed.
- **Check-in**: Resetting the distribution timer to prevent your video from being sent.
- **Recipients**: The people who will receive a link to your video if it is distributed.
- **Public link**: A unique URL that allows anyone with the link to view a distributed video, no account required.

---

## 2. Getting Started

### Requirements

**Android:**
- Android 8.0 (API 26) or higher
- Camera and microphone access
- Internet connection to your Deadman's Drop server

**Before you begin you will need:**
- The URL of your Deadman's Drop server (provided by your server administrator)
- A username and password (created by an administrator via the admin dashboard)

### Installation

Install the app on your device using the APK provided by your server administrator or your organization's app distribution method.

---

## 3. Login

When you first open the app, you will see the login screen.

1. **Server URL** - Enter the full URL of your Deadman's Drop server (e.g., `https://your-server.com`). If you are testing locally with an Android emulator, use `http://10.0.2.2:3000`. For a physical device on the same network, use `http://<server-ip>:3000`.
2. **Username** - Enter your username.
3. **Password** - Enter your password. Tap the eye icon to toggle password visibility.
4. Tap **Log In**.

On success, you are taken to the main video list screen. Your session is saved so you do not need to log in again unless you log out or your session expires.

---

## 4. Recording a Video

1. From the main screen, tap **Record Video**.
2. If prompted, grant camera and microphone permissions. These are required for recording.
3. You will see a live camera preview.
   - Tap the **camera switch** icon to toggle between front and back cameras.
4. Tap the **record button** (red circle) to start recording.
   - The button changes to a red square while recording.
   - A pulsing red dot, elapsed time (MM:SS), and estimated file size are shown on screen.
   - You cannot switch cameras while recording.
5. Tap the **stop button** (red square) to end recording.
6. A dialog appears asking you to add a title:
   - Enter a custom title and tap **Upload**, or
   - Tap **Skip** to auto-generate a title based on the current date and time.
7. The video is added to the upload queue and uploading begins in the background.

### Upload Progress

- A badge on the main screen shows the number of active uploads.
- Tap the badge to view the upload progress sheet, which shows:
  - Progress bar and percentage for the current upload
  - Cancel button for pending uploads
  - Dismiss button for completed uploads

Uploads continue even if you switch to another screen or background the app.

---

## 5. Managing Videos

### Video List

The main screen displays all your videos in a scrollable list. Each video card shows:

- **Title**
- **Status** (Pending, Active, Distributed, or Expired)
- **Distribution countdown** or date
- **Creation date**
- **File size**

Pull down on the list to refresh it.

### Video Detail

Tap a video to view its full details:

- Title and status badge
- Distribution schedule (when it will be or was distributed)
- File details (size, format)
- Creation and last update timestamps

From the detail screen you can:

- **Check In** to reset the distribution timer (Active videos only)
- **Delete** the video permanently

For Distributed videos, a public link section is shown indicating the video is available to recipients.

### Deleting a Video

You can delete a video in two ways:

1. **From the list**: Swipe right on a video card and confirm the deletion.
2. **From the detail screen**: Tap the **Delete Video** button and confirm.

Deleting a video removes the file from the server and frees up your storage quota.

---

## 6. Check-In (Resetting the Timer)

Checking in is the core safety mechanism. It resets the distribution timer on a video so it is not sent to your recipients.

1. From the video list, tap an **Active** video to open its detail screen.
2. Tap **Check In (Reset Timer)**.
3. A confirmation dialog appears. Confirm the action.
4. The distribution timer is reset to your configured default (e.g., 7 days from now).
5. A success message confirms the new distribution date.

**Important notes:**
- The check-in button is only enabled for videos with **Active** status.
- You must check in before the timer expires. Once a video reaches **Distributed** status, it cannot be undone.
- You will receive daily push notifications reminding you to check in (if notifications are enabled).

---

## 7. Distribution Recipients

Recipients are the people who will receive links to your videos when they are distributed.

### Viewing Recipients

1. Open **Settings** from the main screen.
2. Tap **Distribution Recipients**.
3. Your current recipients are listed with their name and email address.

If you have no recipients, an empty state message is shown.

### Adding a Recipient

1. On the Recipients screen, tap the **+** (add) button.
2. Enter the recipient's **email address** (required).
3. Optionally enter a **name**.
4. Tap **Add**.

The email address is validated before submission. Invalid email formats will show an error.

### Removing a Recipient

1. On the Recipients screen, swipe right on a recipient.
2. A confirmation dialog appears asking if you want to remove the recipient.
3. Tap **Remove** to confirm.

---

## 8. Settings

Access settings from the main screen by tapping the **Settings** icon.

### Account

- **Server** - The URL of the server you are connected to (read-only).
- **Username** - Your username (read-only).

### Distribution Timer

- Adjust the default timer using the slider (1-30 days).
- The timer determines how long a newly uploaded video waits before distribution.
- Tap **Save Timer** to apply the change.
- This setting applies to new videos only; existing videos keep their current timers.

### Storage

- **Used** - How much storage you have consumed.
- **Quota** - Your total storage allowance.
- A progress bar shows your usage percentage. It turns red when usage exceeds 90%.

If you are near your quota, delete old or unneeded videos to free space.

### Distribution Recipients

Tap to open the recipients management screen (see [Section 7](#7-distribution-recipients)).

### Log Out

1. Tap **Log Out**.
2. A confirmation dialog appears.
3. Tap **Log Out** to confirm.

Logging out clears all saved credentials and returns you to the login screen.

---

## 9. Notifications

Deadman's Drop sends daily push notifications to remind you to check in on your active videos.

### Enabling Notifications

- On Android 13+, the app will ask for notification permission on first launch.
- Tap **Enable** to allow notifications, or **Not Now** to skip.
- You can change this later in your device's notification settings for the app.

### What to Expect

- **Daily check-in reminders** are sent for each active video approaching its distribution deadline.
- Tapping a notification opens the app and navigates to the relevant video.
- Notifications work even when the app is closed or in the background.

---

## 10. Video Lifecycle

Every video progresses through the following statuses:

| Status | Meaning | Available Actions |
|--------|---------|-------------------|
| **Pending** | Video is queued for upload or upload is in progress. | Delete |
| **Active** | Video is uploaded and the distribution timer is counting down. | Check In, Delete |
| **Distributed** | Timer expired and the video link has been sent to recipients. | Delete |
| **Expired** | 7 days after distribution, the video is automatically deleted from the server. | None (auto-removed) |

### Timeline Example

1. You record and upload a video on **January 1**. Your timer is set to **7 days**.
2. The video becomes **Active** with a distribution date of **January 8**.
3. On **January 5**, you check in. The timer resets to **January 12**.
4. You do not check in again. On **January 12**, the video becomes **Distributed**.
5. Recipients receive a link to view the video.
6. On **January 19** (7 days after distribution), the video **Expires** and is deleted from the server.

---

## 11. Frequently Asked Questions

**Q: What happens if I don't check in?**
A: Your videos will be distributed to your recipients when the timer expires. Distribution checks run hourly on the server.

**Q: Can I undo a distribution?**
A: No. Once a video is distributed, recipients have access to it via the public link. You can delete the video to remove it from the server, but recipients who already downloaded it will still have their copy.

**Q: What if I have no recipients configured?**
A: The video will still transition to Distributed status, but no one will receive a link since there are no recipients. It is recommended to configure at least one recipient.

**Q: What video formats are supported?**
A: The app records in MP4 format. The server accepts standard video MIME types (video/mp4, video/quicktime, etc.).

**Q: Can I change the timer on an existing video?**
A: Not directly. The timer setting in Settings applies to newly uploaded videos. For existing videos, checking in resets the timer to your current default.

**Q: What happens if my upload fails?**
A: The app automatically retries failed uploads with a backoff policy. You can view upload status from the upload progress sheet. Persistent failures will show a notification.

**Q: How much storage do I have?**
A: Your storage quota is set by the server administrator. Check Settings to see your current usage and limit.

**Q: Can recipients view my video without an account?**
A: Yes. Distributed videos are accessible via a public link that requires no authentication. Anyone with the link can view the video.

**Q: Is my data secure?**
A: Your credentials are stored in encrypted storage on your device. All communication with the server should use HTTPS in production. Videos are stored on your private server, not on any third-party cloud service.

**Q: How do I get an account?**
A: Accounts are created by the server administrator through the admin dashboard. Contact your administrator for credentials.
