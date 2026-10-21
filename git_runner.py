import subprocess
import sys

def run_git_command(args):
    """Executes a git command and prints output."""
    cmd = ["git"] + args
    print(f"Executing: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(result.stdout)
        if result.stderr:
            print("Stderr:", result.stderr)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Git command failed with exit code {e.returncode}")
        print("Stdout:", e.stdout)
        print("Stderr:", e.stderr)
        return False

def main():
    print("=== GrillStudio Autonomous Git & Netlify Deployment Runner ===")
    
    # 1. Check git status
    if not run_git_command(["status"]):
        sys.exit(1)
        
    # 2. Add all modified and new files
    if not run_git_command(["add", "."]):
        sys.exit(1)
        
    # 3. Commit changes with a descriptive message
    commit_message = "Autonomous update: Enhanced GrillStudio filmmaking workspace and animation architecture"
    if not run_git_command(["commit", "-m", commit_message]):
        print("No changes to commit or commit skipped.")
        
    # 4. Push to origin main (triggers Netlify deployment)
    if not run_git_command(["push", "origin", "main"]):
        print("Push failed. Verify remote authentication or branch permissions.")
        sys.exit(1)
        
    print("=== Successfully pushed to GitHub! Netlify build triggered. ===")

if __name__ == "__main__":
    main()