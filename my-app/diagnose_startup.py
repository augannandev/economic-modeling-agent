
import subprocess
import os
import sys
import time

OUTPUT_FILE = "diagnostic_output.txt"

def log(message):
    with open(OUTPUT_FILE, "a") as f:
        f.write(message + "\n")
    print(message)

def run_command(command):
    log(f"Running: {command}")
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        log(f"Exit Code: {result.returncode}")
        log(f"Stdout: {result.stdout}")
        log(f"Stderr: {result.stderr}")
        return result.returncode == 0
    except Exception as e:
        log(f"Error: {e}")
        return False

def check_ports():
    log("--- Checking Ports ---")
    run_command("lsof -i :3000")
    run_command("lsof -i :8000")
    run_command("lsof -i :8001")

def main():
    # Clear log
    with open(OUTPUT_FILE, "w") as f:
        f.write("Starting Diagnosis\n")
        
    check_ports()
    
    # Check if we can write to the log files location
    log(f"CWD: {os.getcwd()}")
    log(f"Contents of current dir: {os.listdir('.')}")

if __name__ == "__main__":
    main()
