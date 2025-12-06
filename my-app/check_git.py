
import subprocess
import sys

with open('git_status.log', 'w') as f:
    try:
        result = subprocess.run(['git', 'status'], capture_output=True, text=True)
        f.write(result.stdout)
        f.write(result.stderr)
    except Exception as e:
        f.write(f"Error: {e}")
