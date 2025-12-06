# Installing R on macOS

## Option 1: Using Homebrew (Recommended)

If you have Homebrew installed:

```bash
brew install r
```

After installation, verify:
```bash
Rscript --version
```

Then install R packages:
```bash
Rscript -e "install.packages(c('plumber', 'survival', 'flexsurv', 'rstpm2', 'jsonlite'), repos='https://cloud.r-project.org')"
```

## Option 2: Download R Installer

If you don't have Homebrew:

1. **Download R for macOS**: https://cran.r-project.org/bin/macosx/
   - Choose the `.pkg` file for your Mac (Apple Silicon or Intel)

2. **Install the package** by double-clicking the downloaded file

3. **Add R to PATH** (if needed):
   ```bash
   # Add to ~/.zshrc
   echo 'export PATH="/Library/Frameworks/R.framework/Resources/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   ```

4. **Verify installation**:
   ```bash
   Rscript --version
   ```

5. **Install packages**:
   ```bash
   Rscript -e "install.packages(c('plumber', 'survival', 'flexsurv', 'rstpm2', 'jsonlite'), repos='https://cloud.r-project.org')"
   ```

## Option 3: Skip R Service (Use Weibull Approximation)

**You don't need R to run the analysis!** The system will automatically use Weibull approximation for Gompertz models if R service is unavailable. This is perfectly fine for your presentation.

The analysis will work without R - you'll just get Weibull models instead of true Gompertz for those specific models.

## After Installing R

Once R is installed, start the R service:

```bash
cd my-app/r-service
Rscript main.R
```

Then start your analysis in the UI - it will automatically use the R service for Gompertz models.

