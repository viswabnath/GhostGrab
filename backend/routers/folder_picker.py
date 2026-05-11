"""
Native OS folder picker — triggers the system dialog and returns the selected path.

macOS:  AppleScript (osascript) — native Finder dialog
Windows: PowerShell + FolderBrowserDialog — native Explorer dialog
Linux:  zenity or kdialog
"""
import sys
import subprocess
from fastapi import APIRouter

router = APIRouter()


@router.get("/pick-folder")
async def pick_folder():
    """
    Open the native OS folder picker dialog.
    Returns: {"path": "/selected/path"} or {"path": null} if cancelled.
    """
    path = None

    try:
        if sys.platform == "darwin":
            # macOS — AppleScript opens native Finder dialog
            result = subprocess.run(
                [
                    "osascript", "-e",
                    'POSIX path of (choose folder with prompt "Select save location for GhostGrab")'
                ],
                capture_output=True, text=True, timeout=120
            )
            if result.returncode == 0:
                path = result.stdout.strip().rstrip("/")

        elif sys.platform == "win32":
            # Windows — PowerShell STA thread for WinForms dialog
            ps_script = (
                'Add-Type -AssemblyName System.Windows.Forms; '
                '$d = New-Object System.Windows.Forms.FolderBrowserDialog; '
                '$d.Description = "Select save location for GhostGrab"; '
                '$d.ShowNewFolderButton = $true; '
                'if ($d.ShowDialog() -eq "OK") { Write-Output $d.SelectedPath }'
            )
            result = subprocess.run(
                ["powershell", "-sta", "-NoProfile", "-Command", ps_script],
                capture_output=True, text=True, timeout=120
            )
            if result.returncode == 0 and result.stdout.strip():
                path = result.stdout.strip()

        else:
            # Linux — try zenity, fall back to kdialog
            try:
                result = subprocess.run(
                    ["zenity", "--file-selection", "--directory",
                     "--title=Select save location for GhostGrab"],
                    capture_output=True, text=True, timeout=120
                )
                if result.returncode == 0:
                    path = result.stdout.strip()
            except FileNotFoundError:
                result = subprocess.run(
                    ["kdialog", "--getexistingdirectory", "/",
                     "--title", "Select save location for GhostGrab"],
                    capture_output=True, text=True, timeout=120
                )
                if result.returncode == 0:
                    path = result.stdout.strip()

    except subprocess.TimeoutExpired:
        pass  # User didn't select (closed dialog)
    except Exception as e:
        print(f"[GhostGrab] Folder picker error: {e}")

    return {"path": path}
