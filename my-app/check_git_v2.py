
import subprocess
import sys
import os

# Use absolute path for log file
log_file = os.path.join(os.getcwd(), 'git_status_v2.log')

with open(log_file, 'w') as f:
    try:
        f.write(f"CWD: {os.getcwd()}\n")
        # Run git status
        result = subprocess.run(['git', 'status'], capture_output=True, text=True)
        f.write("--- STDOUT ---\n")
        f.write(result.stdout)
        f.write("\n--- STDERR ---\n")
        f.write(result.stderr)
        f.write(f"\nExit Code: {result.returncode}\n")
    except Exception as e:
        f.write(f"Error: {e}\n")

print(f"Written to {log_file}")
