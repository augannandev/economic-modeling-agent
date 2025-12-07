#!/usr/bin/env python3
"""
KM Curve Extractor - Standalone Script
Extracts curves from Kaplan-Meier plots with text removal and monotonic filtering
"""

import cv2
import numpy as np
import pytesseract
import pandas as pd
import matplotlib.pyplot as plt
import argparse
import os
from pathlib import Path

class KMCurveExtractor:
    def __init__(self, image_path, colors, x_min, x_max, y_min, y_max, x_interval=10, y_interval=20, 
                 curve_names=None, outcome_type=None, output_granularity=None, conservative_text_removal=True):
        """
        Initialize KM Curve Extractor
        
        Args:
            image_path (str): Path to the KM plot image
            colors (list): List of color names to extract ['blue', 'gray', etc.]
            x_min, x_max (float): X-axis data range
            y_min, y_max (float): Y-axis data range
            x_interval, y_interval (float): Grid intervals for overlay
            curve_names (list): Names for each curve ['Treatment A', 'Control', etc.]
            outcome_type (str): Type of outcome ['OS', 'PFS', 'DFS', 'EFS', etc.]
            output_granularity (float): X-axis granularity for output [0.1, 0.2, 0.5, 1.0, etc.]
            conservative_text_removal (bool): Use conservative text removal to protect curves
        """
        self.image_path = image_path
        self.colors = colors
        self.x_min, self.x_max = x_min, x_max
        self.y_min, self.y_max = y_min, y_max
        self.x_interval, self.y_interval = x_interval, y_interval
        
        # New parameters for better file naming and output control
        self.curve_names = curve_names or [f"curve_{i+1}" for i in range(len(colors))]
        self.outcome_type = outcome_type or "survival"
        self.output_granularity = output_granularity  # None means no resampling
        self.conservative_text_removal = conservative_text_removal
        
        # Comprehensive color ranges for HSV detection
        self.color_ranges = {
            # Primary colors
            'red': [([0,50,50], [10,255,255]), ([170,50,50], [180,255,255])],
            'blue': [([100,50,50], [130,255,255])],
            'green': [([40,50,50], [80,255,255])],
            'gray': [([0,0,30], [180,20,120])],  # Balanced: avoid text but capture curves 
            
            # Shades of blue
            'light_blue': [([85,30,100], [105,255,255])],
            'dark_blue': [([105,80,50], [125,255,200])],
            'navy_blue': [([110,100,30], [130,255,150])],
            'cyan': [([80,50,50], [100,255,255])],
            'turquoise': [([75,40,100], [95,255,255])],
            'teal': [([70,50,50], [90,255,200])],
            
            # Shades of red
            'light_red': [([0,30,100], [15,255,255]), ([165,30,100], [180,255,255])],
            'dark_red': [([0,80,50], [10,255,200]), ([170,80,50], [180,255,200])],
            'maroon': [([0,100,30], [10,255,150]), ([170,100,30], [180,255,150])],
            'crimson': [([0,60,100], [10,255,255]), ([165,60,100], [180,255,255])],
            'pink': [([160,20,80], [180,80,255])],
            'magenta': [([140,50,50], [170,255,255])],
            
            # Shades of green
            'light_green': [([35,30,100], [85,255,255])],
            'dark_green': [([40,80,30], [80,255,150])],
            'lime_green': [([30,50,100], [50,255,255])],
            'forest_green': [([45,100,30], [75,255,120])],
            'olive': [([20,40,50], [40,150,180])],
            'emerald': [([50,60,80], [70,255,200])],
            
            # Orange spectrum
            'orange': [([10,50,50], [25,255,255])],
            'light_orange': [([8,30,100], [30,255,255])],
            'dark_orange': [([10,80,50], [25,255,200])],
            'burnt_orange': [([12,100,80], [22,255,180])],
            'coral': [([5,40,100], [20,200,255])],
            'peach': [([5,20,150], [25,100,255])],
            
            # Yellow spectrum
            'yellow': [([20,50,50], [40,255,255])],
            'light_yellow': [([18,20,150], [45,200,255])],
            'gold': [([15,80,100], [35,255,200])],
            'amber': [([20,100,80], [40,255,180])],
            
            # Purple spectrum
            'purple': [([130,50,50], [160,255,255])],
            'light_purple': [([125,30,100], [165,255,255])],
            'dark_purple': [([130,80,30], [160,255,150])],
            'violet': [([120,50,80], [140,255,255])],
            'lavender': [([120,20,150], [145,100,255])],
            'indigo': [([115,100,50], [135,255,200])],
            
            # Brown spectrum
            'brown': [([10,50,20], [20,255,200])],
            'light_brown': [([8,30,80], [25,150,200])],
            'dark_brown': [([5,80,20], [20,255,120])],
            'tan': [([15,30,100], [35,120,220])],
            'beige': [([10,10,150], [30,80,255])],
            
            # Gray spectrum (most important for KM plots)
            'gray': [([0,0,30], [180,20,120])],  # Balanced: avoid text but capture curves  # Standard gray
            'light_gray': [([0,0,120], [180,20,220])],
            'dark_gray': [([0,0,40], [180,30,120])],
            'silver': [([0,0,100], [180,15,200])],
            'charcoal': [([0,0,30], [180,40,100])],
            
            # Black and white
            'black': [([0,0,0], [180,255,50])],
            'white': [([0,0,200], [180,30,255])],
            
            # Medical/publication specific colors
            'medical_blue': [([105,60,80], [125,255,255])],  # Common in medical journals
            'medical_red': [([0,70,100], [10,255,255]), ([170,70,100], [180,255,255])],
            'medical_green': [([45,60,80], [75,255,255])],
            'clinical_gray': [([0,0,90], [180,20,170])],  # Light gray for controls
            
            # Nature/Science journal colors
            'nature_blue': [([110,80,100], [130,255,255])],
            'nature_red': [([0,80,120], [10,255,255]), ([170,80,120], [180,255,255])],
            'nature_green': [([50,80,100], [70,255,255])],
            'nature_orange': [([15,80,120], [25,255,255])],
            
            # Colorblind-friendly palette
            'cb_blue': [([100,70,100], [120,255,255])],     # Colorblind safe blue
            'cb_orange': [([10,70,120], [20,255,255])],     # Colorblind safe orange
            'cb_green': [([45,70,100], [65,255,255])],      # Colorblind safe green
            'cb_pink': [([160,40,120], [180,100,255])],     # Colorblind safe pink
            'cb_yellow': [([25,70,150], [35,255,255])],     # Colorblind safe yellow
            'cb_purple': [([135,70,100], [155,255,255])],   # Colorblind safe purple
            
            # Pastel colors (common in presentations)
            'pastel_blue': [([100,20,150], [120,80,255])],
            'pastel_pink': [([160,15,180], [180,60,255])],
            'pastel_green': [([45,20,150], [75,80,255])],
            'pastel_yellow': [([20,15,200], [40,60,255])],
            'pastel_purple': [([130,20,150], [160,80,255])],
            
            # High contrast colors
            'bright_red': [([0,100,150], [10,255,255]), ([170,100,150], [180,255,255])],
            'bright_blue': [([105,100,150], [125,255,255])],
            'bright_green': [([45,100,150], [75,255,255])],
            'bright_orange': [([12,100,150], [22,255,255])],
            'bright_yellow': [([22,100,200], [38,255,255])],
            
            # Metallic colors
            'gold_metallic': [([20,60,120], [35,200,220])],
            'silver_metallic': [([0,0,120], [180,20,200])],
            'copper': [([10,80,100], [20,200,180])],
            'bronze': [([15,70,80], [25,180,160])],
        }
        
        # Store processing results
        self.original_image = None
        self.cropped_image = None
        self.processed_image = None
        self.extracted_curves = None
        self.monotonic_curves = None
    
    def list_available_colors(self):
        """List all available color options"""
        print("🎨 Available Colors (70+ options):")
        print("="*50)
        
        categories = {
            "Primary": ['red', 'blue', 'green'],
            "Blue Spectrum": ['light_blue', 'dark_blue', 'navy_blue', 'cyan', 'turquoise', 'teal'],
            "Red Spectrum": ['light_red', 'dark_red', 'maroon', 'crimson', 'pink', 'magenta'],
            "Green Spectrum": ['light_green', 'dark_green', 'lime_green', 'forest_green', 'olive', 'emerald'],
            "Orange/Yellow": ['orange', 'light_orange', 'dark_orange', 'burnt_orange', 'coral', 'peach', 
                             'yellow', 'light_yellow', 'gold', 'amber'],
            "Purple Spectrum": ['purple', 'light_purple', 'dark_purple', 'violet', 'lavender', 'indigo'],
            "Brown Spectrum": ['brown', 'light_brown', 'dark_brown', 'tan', 'beige'],
            "Gray Spectrum": ['gray', 'light_gray', 'dark_gray', 'silver', 'charcoal', 'clinical_gray'],
            "Black/White": ['black', 'white'],
            "Medical/Publication": ['medical_blue', 'medical_red', 'medical_green', 'nature_blue', 
                                   'nature_red', 'nature_green', 'nature_orange'],
            "Colorblind-Safe": ['cb_blue', 'cb_orange', 'cb_green', 'cb_pink', 'cb_yellow', 'cb_purple'],
            "Pastel Colors": ['pastel_blue', 'pastel_pink', 'pastel_green', 'pastel_yellow', 'pastel_purple'],
            "High Contrast": ['bright_red', 'bright_blue', 'bright_green', 'bright_orange', 'bright_yellow'],
            "Metallic": ['gold_metallic', 'silver_metallic', 'copper', 'bronze']
        }
        
        for category, colors in categories.items():
            print(f"\n{category}:")
            for i, color in enumerate(colors):
                if color in self.color_ranges:
                    hsv_info = self.color_ranges[color][0]  # First HSV range
                    print(f"  {color:<15} - HSV: {hsv_info}")
                else:
                    print(f"  {color:<15} - Not found!")
                    
        print(f"\nTotal colors available: {len(self.color_ranges)}")
        return list(self.color_ranges.keys())
    
    def get_curve_display_name(self, color_index):
        """Get the display name for a curve based on its index"""
        if color_index < len(self.curve_names):
            return self.curve_names[color_index]
        else:
            return f"curve_{color_index + 1}"
    
    def get_safe_filename(self, curve_name):
        """Convert curve name to safe filename"""
        # Remove special characters and replace spaces with underscores
        import re
        safe_name = re.sub(r'[^\w\s-]', '', curve_name)
        safe_name = re.sub(r'[-\s]+', '_', safe_name)
        return safe_name.lower()
    
    def resample_curve_data(self, df, granularity):
        """
        Resample curve data to specified X-axis granularity
        
        Args:
            df: DataFrame with X and Y columns
            granularity: X-axis step size (e.g., 0.1, 0.5, 1.0)
            
        Returns:
            DataFrame with resampled data
        """
        if df.empty or granularity is None:
            return df
        
        import numpy as np
        import pandas as pd
        from scipy.interpolate import interp1d
        
        # Sort by X
        df_sorted = df.sort_values('X').reset_index(drop=True)
        
        # Create new X grid
        x_min_rounded = np.floor(df_sorted['X'].min() / granularity) * granularity
        x_max_rounded = np.ceil(df_sorted['X'].max() / granularity) * granularity
        x_new = np.arange(x_min_rounded, x_max_rounded + granularity, granularity)
        
        # Filter X values within original range
        x_new = x_new[(x_new >= df_sorted['X'].min()) & (x_new <= df_sorted['X'].max())]
        
        if len(df_sorted) < 2:
            # Not enough points for interpolation
            return df_sorted
        
        try:
            # Use step-wise interpolation for KM curves (previous value carries forward)
            f = interp1d(df_sorted['X'], df_sorted['Y'], kind='previous', 
                        bounds_error=False, fill_value=(df_sorted['Y'].iloc[0], df_sorted['Y'].iloc[-1]))
            y_new = f(x_new)
            
            # Create resampled DataFrame
            df_resampled = pd.DataFrame({
                'X': x_new,
                'Y': y_new
            })
            
            return df_resampled
            
        except Exception as e:
            print(f"   ⚠️  Resampling failed: {e}, returning original data")
            return df_sorted
    
    def ensure_km_start_point(self, df):
        """
        Ensure KM curve starts at time 0 with 100% survival (or 1.0 for probability scale)
        
        Args:
            df: DataFrame with X and Y columns
            
        Returns:
            DataFrame with proper KM starting point
        """
        if df.empty:
            return df
        
        import pandas as pd
        import numpy as np
        
        # Sort by X to ensure proper order
        df_sorted = df.sort_values('X').reset_index(drop=True)
        
        # Determine if we're using percentage (0-100) or probability (0-1) scale
        max_y = df_sorted['Y'].max()
        is_percentage_scale = max_y > 10  # Assume percentage if max > 10
        
        starting_y = 100.0 if is_percentage_scale else 1.0
        
        # Check if we already have a point at or very close to X=0
        if not df_sorted.empty and df_sorted['X'].min() <= 0.1:
            # If we have a point very close to 0, check if it's at the right Y value
            first_row = df_sorted.iloc[0]
            if first_row['X'] <= 0.1:
                # Update the first point to be exactly at (0, starting_y)
                df_sorted.loc[0, 'X'] = 0.0
                df_sorted.loc[0, 'Y'] = starting_y
                print(f"   ✅ Adjusted existing point to (0, {starting_y})")
                return df_sorted
        
        # Add starting point (0, starting_y) at the beginning
        start_point = pd.DataFrame({'X': [0.0], 'Y': [starting_y]})
        df_with_start = pd.concat([start_point, df_sorted], ignore_index=True)
        
        print(f"   ✅ Added KM starting point: (0, {starting_y})")
        return df_with_start
        
    def load_image(self):
        """Load and validate image"""
        print(f"📂 Loading image: {self.image_path}")
        
        image = cv2.imread(self.image_path)
        if image is None:
            raise FileNotFoundError(f"Image {self.image_path} not found")
        
        self.original_image = image
        print(f"   ✅ Image loaded: {image.shape[1]}x{image.shape[0]} pixels")
        return image, cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    def detect_axes(self, gray):
        """Detect X/Y axes using Hough Transform"""
        print("🔍 Detecting axes...")
        
        edges = cv2.Canny(gray, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=200, minLineLength=100, maxLineGap=10)

        h_lines, v_lines = [], []
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                if abs(x1-x2) < 10:  # Vertical
                    v_lines.append((x1, y1, x2, y2))
                elif abs(y1-y2) < 10:  # Horizontal
                    h_lines.append((x1, y1, x2, y2))

        x_axis = max(h_lines, key=lambda l: abs(l[2]-l[0])) if h_lines else None
        y_axis = max(v_lines, key=lambda l: abs(l[3]-l[1])) if v_lines else None
        
        print(f"   ✅ Detected axes: X{x_axis}, Y{y_axis}")
        return x_axis, y_axis
    
    def crop_to_axes(self, image, x_axis, y_axis):
        """Crop image to axis boundaries"""
        print("✂️ Cropping to plot area...")
        
        left = min(y_axis[0], y_axis[2])
        right = max(x_axis[0], x_axis[2])
        top = min(y_axis[1], y_axis[3])
        bottom = max(x_axis[1], x_axis[3])

        cropped = image[top:bottom, left:right]
        self.cropped_image = cropped
        print(f"   ✅ Cropped to: {cropped.shape[1]}x{cropped.shape[0]} pixels")
        return cropped
    
    def create_scaled_grid(self, cropped_img):
        """Create grid using specified axis ranges"""
        print("📊 Creating scaled grid...")
        
        grid = cropped_img.copy()
        height, width = grid.shape[:2]
        x_scale = width / (self.x_max - self.x_min)
        y_scale = height / (self.y_max - self.y_min)

        # Draw vertical grid lines
        for x in np.arange(self.x_min, self.x_max, self.x_interval):
            px = int((x - self.x_min) * x_scale)
            cv2.line(grid, (px, 0), (px, height), (200,200,200), 1)

        # Draw horizontal grid lines
        for y in np.arange(self.y_min, self.y_max, self.y_interval):
            py = int(height - (y - self.y_min) * y_scale)
            cv2.line(grid, (0, py), (width, py), (200,200,200), 1)

        print(f"   ✅ Grid created with intervals: X={self.x_interval}, Y={self.y_interval}")
        return grid
    
    def remove_text_stage1(self, grid):
        """Stage 1 text removal with curve protection"""
        print("🧹 Stage 1: Text removal with curve protection...")
        
        grid_gray = cv2.cvtColor(grid, cv2.COLOR_BGR2GRAY)
        
        # Use pytesseract to detect text with bounding box info
        data = pytesseract.image_to_data(grid_gray, output_type=pytesseract.Output.DICT, config='--psm 6')
        
        # Create a refined mask for text regions
        refined_mask = np.zeros(grid_gray.shape, dtype=np.uint8)
        n_boxes = len(data['level'])
        text_regions_found = 0
        
        for i in range(n_boxes):
            try:
                conf_val = float(data['conf'][i])
            except ValueError:
                conf_val = 0
                
            # Use a higher confidence threshold to filter out spurious detections
            if conf_val > 80:
                x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
                
                # Extract the region of interest (ROI) from the grid image
                roi = grid[y:y+h, x:x+w]
                
                # Convert ROI to HSV to analyze its hue
                hsv_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
                avg_hsv = np.mean(hsv_roi, axis=(0,1))
                
                # Enhanced curve protection - check if ROI contains curve pixels
                is_curve_region = self._is_curve_region(roi, hsv_roi)
                
                if is_curve_region:
                    print(f"   🛡️  Protecting curve region at ({x},{y}) from text removal")
                    continue
                else:
                    cv2.rectangle(refined_mask, (x, y), (x+w, y+h), 255, -1)
                    text_regions_found += 1

        print(f"   📝 Text regions detected: {text_regions_found}")
        
        # Inpaint the grid image using the refined mask
        inpainted_grid = cv2.inpaint(grid, refined_mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
        self.processed_image = inpainted_grid
        
        print("   ✅ Stage 1 text removal complete")
        return inpainted_grid
    
    def _is_curve_region(self, roi, hsv_roi):
        """
        Enhanced curve detection to protect curve regions from text removal
        
        Args:
            roi: BGR image region
            hsv_roi: HSV version of the same region
            
        Returns:
            True if region likely contains curve pixels
        """
        import cv2
        import numpy as np
        
        # Check for any of the colors we're extracting
        for color_name in self.colors:
            if color_name.lower() in self.color_ranges:
                # Test each color range for this color
                for lower, upper in self.color_ranges[color_name.lower()]:
                    mask = cv2.inRange(hsv_roi, np.array(lower), np.array(upper))
                    curve_pixel_count = cv2.countNonZero(mask)
                    
                    # If significant portion of ROI matches curve colors, protect it
                    total_pixels = roi.shape[0] * roi.shape[1]
                    curve_percentage = curve_pixel_count / total_pixels
                    
                    if curve_percentage > 0.1:  # 10% threshold
                        return True
        
        # Additional protection for line-like structures
        gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if len(roi.shape) == 3 else roi
        
        # Detect edges to identify line structures
        edges = cv2.Canny(gray_roi, 50, 150)
        edge_pixel_count = cv2.countNonZero(edges)
        total_pixels = gray_roi.shape[0] * gray_roi.shape[1]
        edge_percentage = edge_pixel_count / total_pixels
        
        # If high edge density, likely a curve
        if edge_percentage > 0.05:  # 5% edge threshold
            return True
        
        # Check for horizontal or step-like patterns (typical of KM curves)
        # Look for horizontal lines with occasional vertical drops
        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 1))
        horizontal_lines = cv2.morphologyEx(edges, cv2.MORPH_OPEN, horizontal_kernel)
        horizontal_count = cv2.countNonZero(horizontal_lines)
        
        if horizontal_count > total_pixels * 0.02:  # 2% horizontal line threshold
            return True
        
        return False
    
    def remove_text_conservative(self, grid):
        """
        Conservative text removal that focuses only on obvious text regions
        This is safer but may leave some text artifacts
        """
        print("🧹 Conservative text removal (curve-safe)...")
        
        grid_gray = cv2.cvtColor(grid, cv2.COLOR_BGR2GRAY)
        
        # Use pytesseract to detect text with higher confidence threshold
        data = pytesseract.image_to_data(grid_gray, output_type=pytesseract.Output.DICT, config='--psm 6')
        
        # Create a very conservative mask for text regions
        conservative_mask = np.zeros(grid_gray.shape, dtype=np.uint8)
        n_boxes = len(data['level'])
        text_regions_found = 0
        
        for i in range(n_boxes):
            try:
                conf_val = float(data['conf'][i])
            except ValueError:
                conf_val = 0
            
            # Use very high confidence threshold and check text characteristics
            if conf_val > 90:  # Higher threshold
                x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
                text_content = data['text'][i].strip()
                
                # Only remove if it's clearly text (has letters/numbers)
                if len(text_content) > 0 and any(c.isalnum() for c in text_content):
                    roi = grid[y:y+h, x:x+w]
                    
                    # Additional safety: check if region is mostly text-colored (not curve colors)
                    hsv_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
                    
                    # Skip if ANY curve color detected
                    has_curve_color = False
                    for color_name in self.colors:
                        if color_name.lower() in self.color_ranges:
                            for lower, upper in self.color_ranges[color_name.lower()]:
                                mask = cv2.inRange(hsv_roi, np.array(lower), np.array(upper))
                                if cv2.countNonZero(mask) > 0:  # Any curve pixels = skip
                                    has_curve_color = True
                                    break
                    
                    if not has_curve_color:
                        cv2.rectangle(conservative_mask, (x, y), (x+w, y+h), 255, -1)
                        text_regions_found += 1
                        print(f"   📝 Removing text: '{text_content}' at ({x},{y})")
                    else:
                        print(f"   🛡️  Protecting region with text '{text_content}' (contains curve pixels)")

        print(f"   📝 Conservative text regions removed: {text_regions_found}")
        
        # Use smaller inpaint radius for less aggressive filling
        inpainted_grid = cv2.inpaint(grid, conservative_mask, inpaintRadius=2, flags=cv2.INPAINT_TELEA)
        self.processed_image = inpainted_grid
        
        print("   ✅ Conservative text removal complete")
        return inpainted_grid
    
    def extract_curves_with_grid_filtering(self, image):
        """Extract curves using color masks with grid line filtering"""
        print("🎨 Extracting curves with grid line filtering...")
        
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        height, width = image.shape[:2]
        
        curves = {}
        x_scale = width / (self.x_max - self.x_min)
        y_scale = height / (self.y_max - self.y_min)

        for color in self.colors:
            print(f"   🔍 Extracting {color} curve...")
            
            if color.lower() not in self.color_ranges:
                print(f"   ❌ Color '{color}' not supported")
                continue
                
            combined_mask = None
            for lower, upper in self.color_ranges[color.lower()]:
                mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
                combined_mask = mask if combined_mask is None else cv2.bitwise_or(combined_mask, mask)
                
                # Smart filtering for gray curves to avoid text
                if color.lower() == 'gray' and combined_mask is not None:
                    print(f"     🎯 Applying smart filtering for {color} to avoid text...")
                    
                    # Apply morphological operations to remove small text artifacts
                    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
                    combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_OPEN, kernel)
                    combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, kernel)
                    
                    # Remove very small components (likely text) and isolated pixels
                    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(combined_mask, connectivity=8)
                    min_area = 20  # Minimum area for curve segments
                    filtered_mask = np.zeros_like(combined_mask)
                    
                    components_kept = 0
                    for i in range(1, num_labels):  # Skip background (0)
                        area = stats[i, cv2.CC_STAT_AREA]
                        if area >= min_area:
                            # Additional check: curve-like components are more elongated
                            width = stats[i, cv2.CC_STAT_WIDTH]
                            height = stats[i, cv2.CC_STAT_HEIGHT]
                            aspect_ratio = max(width, height) / max(min(width, height), 1)
                            
                            # Keep components that are large enough OR elongated (curve-like)
                            if area >= min_area or aspect_ratio >= 2.5:
                                filtered_mask[labels == i] = 255
                                components_kept += 1
                    
                    combined_mask = filtered_mask
                    print(f"     🧹 Kept {components_kept} curve-like components, filtered out text artifacts")
                    
                    # Additional filtering: remove horizontal/vertical lines that might be grid/text
                    lines = cv2.HoughLinesP(combined_mask, 1, np.pi/180, threshold=30, minLineLength=50, maxLineGap=10)
                    if lines is not None:
                        line_mask = np.zeros_like(combined_mask)
                        horizontal_lines = 0
                        vertical_lines = 0
                        
                        for line in lines:
                            x1, y1, x2, y2 = line[0]
                            angle = np.arctan2(abs(y2-y1), abs(x2-x1)) * 180 / np.pi
                            
                            # Remove near-horizontal or near-vertical lines (likely grid/text)
                            if angle < 10 or angle > 80:  # Nearly horizontal or vertical
                                cv2.line(line_mask, (x1, y1), (x2, y2), 255, 2)
                                if angle < 10:
                                    horizontal_lines += 1
                                else:
                                    vertical_lines += 1
                        
                        # Remove detected grid lines from the mask
                        combined_mask = cv2.bitwise_and(combined_mask, cv2.bitwise_not(line_mask))
                        print(f"     📏 Removed {horizontal_lines} horizontal and {vertical_lines} vertical grid/text lines")
            # # Original grid line filtering code (disabled)
            # if False: # color.lower() == 'gray' and combined_mask is not None:
            #     print(f"     🔧 Applying grid line filtering for {color}...")
                
            #     # Detect grid lines using Hough transform
            #     edges = cv2.Canny(gray, 50, 150)
            #     lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=50, minLineLength=30, maxLineGap=5)
                
            #     # Create grid line mask
            #     grid_mask = np.zeros(gray.shape, dtype=np.uint8)
            #     grid_lines_found = 0
            #     if lines is not None:
            #         grid_lines_found = len(lines)
            #         for line in lines:
            #             x1, y1, x2, y2 = line[0]
            #             # Draw line with some thickness to mask grid lines
            #             cv2.line(grid_mask, (x1, y1), (x2, y2), 255, 3)
                
            #     print(f"     📏 Grid lines detected: {grid_lines_found}")
                
            #     # Remove grid lines from gray mask
            #     combined_mask = cv2.bitwise_and(combined_mask, cv2.bitwise_not(grid_mask))
                
            #     # Additional morphological filtering to clean up noise
            #     kernel = np.ones((2,2), np.uint8)
            #     combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, kernel)
            #     combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_OPEN, kernel)

            y_coords, x_coords = np.where(combined_mask > 0)
            if len(x_coords) == 0:
                print(f"   ❌ No {color} points found")
                continue

            x_data = self.x_min + (x_coords / x_scale)
            y_data = self.y_max - (y_coords / y_scale)
            df = pd.DataFrame({'X': x_data, 'Y': y_data}).sort_values('X').drop_duplicates()
            
            # Additional filtering for gray curves - remove points that are likely grid intersections
            if color.lower() == 'gray' and len(df) > 0:
                print(f"     🧹 Statistical cleaning for {color}...")
                # Group by X and take median Y for each X column (removes scattered grid points)
                df_grouped = df.groupby(df['X'].round(1))['Y'].median().reset_index()
                df_grouped.columns = ['X', 'Y']
                curves[color] = df_grouped.reset_index(drop=True)
            else:
                curves[color] = df.reset_index(drop=True)
            
            print(f"   ✅ {color}: {len(curves[color])} points extracted")

        self.extracted_curves = curves
        print(f"🎯 Curve extraction complete: {len(curves)} curves")
        return curves
    
    def apply_strict_monotonic_filter(self, curves):
        """Apply strict monotonic filtering - Y values can only stay same or decrease"""
        print("⬇️ Applying strict monotonic filtering...")
        
        filtered_curves = {}
        
        for curve_name, df in curves.items():
            if len(df) == 0:
                filtered_curves[curve_name] = df
                continue
                
            print(f"   🔧 Filtering {curve_name} curve...")
            print(f"     Original points: {len(df)}")
            
            # Sort by X and copy
            df_filtered = df.sort_values('X').copy().reset_index(drop=True)
            
            # Track changes made
            corrections_made = 0
            
            # STRICT MONOTONIC: Y can only stay same or decrease
            for i in range(1, len(df_filtered)):
                current_y = df_filtered.iloc[i]['Y']
                previous_y = df_filtered.iloc[i-1]['Y']
                
                if current_y > previous_y:
                    # Violation: Y increased, force it to be same as previous
                    df_filtered.iloc[i, df_filtered.columns.get_loc('Y')] = previous_y
                    corrections_made += 1
            
            print(f"     Monotonic corrections: {corrections_made}")
            
            # Calculate statistics
            if len(df_filtered) > 1:
                y_diffs = df_filtered['Y'].diff()
                increasing_violations = (y_diffs > 0.01).sum()  # Small tolerance for floating point
                monotonic_percent = (1 - increasing_violations / len(y_diffs)) * 100
                significant_drops = (y_diffs < -2.0).sum()
                
                print(f"     ✅ Monotonic compliance: {monotonic_percent:.1f}%")
                print(f"     📉 Significant drops: {significant_drops}")
                print(f"     📊 Y range: {df_filtered['Y'].min():.1f} to {df_filtered['Y'].max():.1f}")
            
            filtered_curves[curve_name] = df_filtered
        
        self.monotonic_curves = filtered_curves
        print("✅ Monotonic filtering complete")
        return filtered_curves
    
    def plot_results(self, save_plots=True):
        """Create comprehensive visualization of results"""
        print("📊 Creating result plots...")
        
        if not self.extracted_curves:
            print("❌ No curves to plot")
            return
        
        # 1. Processing pipeline visualization
        fig, axes = plt.subplots(2, 3, figsize=(18, 12))
        
        # Original image
        axes[0,0].imshow(cv2.cvtColor(self.original_image, cv2.COLOR_BGR2RGB))
        axes[0,0].set_title("1. Original Image")
        axes[0,0].axis('off')
        
        # Cropped image
        axes[0,1].imshow(cv2.cvtColor(self.cropped_image, cv2.COLOR_BGR2RGB))
        axes[0,1].set_title("2. Cropped to Plot Area")
        axes[0,1].axis('off')
        
        # Processed image
        axes[0,2].imshow(cv2.cvtColor(self.processed_image, cv2.COLOR_BGR2RGB))
        axes[0,2].set_title("3. Text Removed")
        axes[0,2].axis('off')
        
        # Original extracted curves
        axes[1,0].set_title("4. Original Extracted Curves")
        for curve_name, df in self.extracted_curves.items():
            if len(df) > 0:
                axes[1,0].plot(df['X'], df['Y'], 'o-', label=f'{curve_name} (n={len(df)})', markersize=2)
        axes[1,0].set_xlabel('X-axis')
        axes[1,0].set_ylabel('Y-axis')
        axes[1,0].legend()
        axes[1,0].grid(True, alpha=0.3)
        axes[1,0].set_xlim(self.x_min, self.x_max)
        axes[1,0].set_ylim(self.y_min, self.y_max)
        
        # Monotonic filtered curves
        axes[1,1].set_title("5. Monotonic Filtered Curves")
        if self.monotonic_curves:
            for curve_name, df in self.monotonic_curves.items():
                if len(df) > 0:
                    axes[1,1].plot(df['X'], df['Y'], 'o-', label=f'{curve_name} (n={len(df)})', markersize=2, linewidth=2)
        axes[1,1].set_xlabel('X-axis')
        axes[1,1].set_ylabel('Y-axis')
        axes[1,1].legend()
        axes[1,1].grid(True, alpha=0.3)
        axes[1,1].set_xlim(self.x_min, self.x_max)
        axes[1,1].set_ylim(self.y_min, self.y_max)
        
        # Validation: Clean digitized curves (better approach)
        axes[1,2].set_title("6. Final Digitized Curves")
        
        # Plot clean digitized curves without image background
        if self.monotonic_curves:
            colors_map = {'blue': '#0066CC', 'red': '#CC0000', 'green': '#00AA00', 
                         'gray': '#666666', 'orange': '#FF6600', 'purple': '#9900CC'}
            
            for curve_name, df in self.monotonic_curves.items():
                if len(df) > 0:
                    plot_color = colors_map.get(curve_name, 'black')
                    # Convert to step function coordinates (matches final CSV)
                    df_step = self.convert_to_step_function(df)
                    # Use step plot for KM curves with step function data
                    axes[1,2].step(df_step['X'], df_step['Y'], where='post',
                                 color=plot_color, linewidth=2,
                                 label=f'{curve_name} ({len(df_step)} pts)')
                    # Add markers at original data points
                    axes[1,2].plot(df['X'], df['Y'], 'o', 
                                 color=plot_color, markersize=2)
        
        axes[1,2].set_xlabel('Time (months)')
        axes[1,2].set_ylabel('Survival (%)')
        axes[1,2].legend(loc='upper right', fontsize=8)
        axes[1,2].grid(True, alpha=0.3)
        axes[1,2].set_xlim(self.x_min, self.x_max)
        axes[1,2].set_ylim(self.y_min, self.y_max)
        
        # Add proper tick marks
        try:
            x_step = max(1, int(self.x_interval//2)) if self.x_interval > 0 else 1
            y_step = max(1, int(self.y_interval//2)) if self.y_interval > 0 else 1
            x_ticks = range(int(self.x_min), int(self.x_max)+1, x_step)
            y_ticks = range(int(self.y_min), int(self.y_max)+1, y_step)
            axes[1,2].set_xticks(x_ticks)
            axes[1,2].set_yticks(y_ticks)
        except (ValueError, TypeError):
            # Fallback to automatic ticks if manual fails
            pass
        
        plt.tight_layout()
        if save_plots:
            plt.savefig('km_extraction_pipeline.png', dpi=300, bbox_inches='tight')
            print("   💾 Saved: km_extraction_pipeline.png")
        plt.show()
        
        # 2. Individual curve plots using step function data
        if self.monotonic_curves:
            for curve_name, df in self.monotonic_curves.items():
                if len(df) > 0:
                    plt.figure(figsize=(10, 6))
                    # Convert to step function coordinates (matches final CSV)
                    df_step = self.convert_to_step_function(df)
                    # Plot step function
                    plt.step(df_step['X'], df_step['Y'], where='post', linewidth=2, label=f'{curve_name} (Step Function)')
                    # Add markers at original data points
                    plt.plot(df['X'], df['Y'], 'o', markersize=4, label=f'{curve_name} (Key Points)')
                    
                    # Also plot original for comparison
                    if curve_name in self.extracted_curves and len(self.extracted_curves[curve_name]) > 0:
                        plt.plot(self.extracted_curves[curve_name]['X'], 
                               self.extracted_curves[curve_name]['Y'], 
                               'o-', alpha=0.4, linewidth=1, markersize=2, 
                               label=f'{curve_name} (Original)')
                    
                    plt.xlabel('X-axis')
                    plt.ylabel('Y-axis')
                    plt.title(f'{curve_name.upper()} Curve - Final CSV Format')
                    plt.legend()
                    plt.grid(True, alpha=0.3)
                    plt.xlim(self.x_min, self.x_max)
                    plt.ylim(self.y_min, self.y_max)
                    
                    if save_plots:
                        plt.savefig(f'km_curve_{curve_name}.png', dpi=300, bbox_inches='tight')
                        print(f"   💾 Saved: km_curve_{curve_name}.png")
                    plt.show()
        
        # Create dedicated validation plot
        self.create_validation_plot(save_plots)
    
    def create_validation_plot(self, save_plot=True):
        """Create a dedicated validation plot comparing original image with digitized curves"""
        if not self.monotonic_curves or self.original_image is None:
            print("   ⚠️  Cannot create validation plot - missing data")
            return
        
        print("📊 Creating enhanced validation plot...")
        
        # Create figure with better layout
        fig = plt.figure(figsize=(20, 10))
        
        # Left: Original image (larger)
        ax1 = plt.subplot(1, 3, (1, 2))  # Takes 2/3 of the width
        ax1.imshow(cv2.cvtColor(self.original_image, cv2.COLOR_BGR2RGB))
        ax1.set_title("Original KM Plot", fontsize=16, fontweight='bold', pad=20)
        ax1.axis('off')
        
        # Right: Digitized curves only (cleaner)
        ax2 = plt.subplot(1, 3, 3)
        
        # Color mapping for better visualization
        colors_map = {
            'blue': '#0066CC', 'red': '#CC0000', 'green': '#00AA00', 
            'gray': '#666666', 'grey': '#666666', 'orange': '#FF6600', 
            'purple': '#9900CC', 'black': '#000000',
            'light_blue': '#3399FF', 'dark_blue': '#003399',
            'light_gray': '#999999', 'dark_gray': '#333333',
            'medical_blue': '#0080FF', 'clinical_gray': '#808080'
        }
        
        # Plot clean digitized curves using step function data (matches final CSV)
        curve_count = 0
        for curve_name, df in self.monotonic_curves.items():
            if len(df) > 0:
                curve_count += 1
                # Get appropriate color
                plot_color = colors_map.get(curve_name.lower(), 'black')
                
                # Convert to step function coordinates (same as final CSV)
                df_step = self.convert_to_step_function(df)
                
                # Plot with KM curve style using step function data
                ax2.step(df_step['X'], df_step['Y'], where='post', 
                        color=plot_color, linewidth=3,
                        label=f'{curve_name} ({len(df_step)} pts)', alpha=0.9)
                
                # Add markers at original data points (not step points)
                ax2.plot(df['X'], df['Y'], 'o', 
                        color=plot_color, markersize=4,
                        markeredgecolor='white', markeredgewidth=1)
        
        ax2.set_title("Extracted Curves", fontsize=16, fontweight='bold', pad=20)
        ax2.set_xlabel('Time (months)', fontsize=12)
        ax2.set_ylabel('Progression-Free Survival (%)', fontsize=12)
        ax2.legend(loc='upper right', framealpha=0.9, fontsize=11)
        ax2.grid(True, alpha=0.3, linestyle='--')
        ax2.set_xlim(self.x_min, self.x_max)
        ax2.set_ylim(self.y_min, self.y_max)
        
        # Set proper ticks to match original
        try:
            x_step = max(1, int(self.x_interval)) if self.x_interval > 0 else 1
            y_step = max(1, int(self.y_interval)) if self.y_interval > 0 else 1
            ax2.set_xticks(range(int(self.x_min), int(self.x_max)+1, x_step))
            ax2.set_yticks(range(int(self.y_min), int(self.y_max)+1, y_step))
        except (ValueError, TypeError):
            pass
        
        # Add extraction statistics in a box
        total_points = sum(len(df) for df in self.monotonic_curves.values())
        
        # Calculate quality metrics
        metrics = self.calculate_validation_metrics()
        avg_quality = sum(m.get('monotonic_compliance', 0) for m in metrics.values()) / len(metrics) if metrics else 0
        
        textstr = f'📊 Extraction Summary\n'
        textstr += f'Curves: {curve_count}\n'
        textstr += f'Total points: {total_points}\n'
        textstr += f'Avg. quality: {avg_quality:.1f}%\n'
        textstr += f'Range: {self.x_min}-{self.x_max} months\n'
        textstr += f'Scale: {self.y_min}-{self.y_max}%'
        
        props = dict(boxstyle='round,pad=0.5', facecolor='lightblue', alpha=0.8)
        ax2.text(0.02, 0.98, textstr, transform=ax2.transAxes, fontsize=10,
                verticalalignment='top', bbox=props)
        
        plt.tight_layout()
        
        if save_plot:
            plt.savefig('km_validation_comparison.png', dpi=300, bbox_inches='tight')
            print("   💾 Saved: km_validation_comparison.png")
        
        plt.show()
        
        # Create an additional overlay plot for precise validation
        self._create_precise_overlay_plot(save_plot)
    
    def _create_precise_overlay_plot(self, save_plot=True):
        """Create a precise overlay plot using the cropped image area"""
        if self.cropped_image is None or not self.monotonic_curves:
            return
        
        print("📊 Creating precise overlay validation...")
        
        fig, ax = plt.subplots(1, 1, figsize=(12, 8))
        
        # Use the cropped image which has proper scaling
        ax.imshow(cv2.cvtColor(self.cropped_image, cv2.COLOR_BGR2RGB), 
                 extent=[self.x_min, self.x_max, self.y_min, self.y_max], 
                 aspect='auto', alpha=0.85)
        
        # Color mapping
        colors_map = {
            'blue': '#0000FF', 'red': '#FF0000', 'green': '#00AA00', 
            'gray': '#666666', 'grey': '#666666', 'orange': '#FF6600', 
            'purple': '#9900CC', 'black': '#000000'
        }
        
        # Overlay curves with high visibility using step function data (matches final CSV)
        for curve_name, df in self.monotonic_curves.items():
            if len(df) > 0:
                plot_color = colors_map.get(curve_name.lower(), 'yellow')
                
                # Convert to step function coordinates (same as final CSV)
                df_step = self.convert_to_step_function(df)
                
                # Thick line with outline for maximum visibility using step function
                ax.plot(df_step['X'], df_step['Y'], '-', 
                       color='white', linewidth=6, alpha=0.8)  # White outline
                ax.plot(df_step['X'], df_step['Y'], '-', 
                       color=plot_color, linewidth=4, alpha=1.0,
                       label=f'{curve_name} (step function)')
                
                # Add markers at original data points (shows the key events)
                y_diff = df['Y'].diff().abs()
                step_mask = y_diff > 1  # Significant changes
                step_points = df[step_mask.fillna(False)]  # Handle NaN from diff()
                if len(step_points) > 0:
                    ax.plot(step_points['X'], step_points['Y'], 'o', 
                           color=plot_color, markersize=6,
                           markeredgecolor='white', markeredgewidth=2)
        
        ax.set_title("Precision Validation: Digitized Curves on Original Plot", 
                    fontsize=14, fontweight='bold')
        ax.set_xlabel('Time (months)', fontsize=12)
        ax.set_ylabel('Progression-Free Survival (%)', fontsize=12)
        ax.legend(loc='upper right', framealpha=0.9)
        ax.grid(True, alpha=0.3, linestyle=':', color='yellow')
        ax.set_xlim(self.x_min, self.x_max)
        ax.set_ylim(self.y_min, self.y_max)
        
        # Add validation grid
        try:
            x_step = max(1, int(self.x_interval)) if self.x_interval > 0 else 1
            y_step = max(1, int(self.y_interval)) if self.y_interval > 0 else 1
            ax.set_xticks(range(int(self.x_min), int(self.x_max)+1, x_step))
            ax.set_yticks(range(int(self.y_min), int(self.y_max)+1, y_step))
        except (ValueError, TypeError):
            pass
        
        plt.tight_layout()
        
        if save_plot:
            plt.savefig('km_precision_overlay.png', dpi=300, bbox_inches='tight')
            print("   💾 Saved: km_precision_overlay.png")
        
        plt.show()
    
    def calculate_validation_metrics(self):
        """Calculate validation metrics for the extraction"""
        if not self.monotonic_curves:
            return {}
        
        metrics = {}
        
        for curve_name, df in self.monotonic_curves.items():
            if len(df) == 0:
                continue
                
            curve_metrics = {}
            
            # Basic statistics
            curve_metrics['points_extracted'] = len(df)
            curve_metrics['x_range'] = (df['X'].min(), df['X'].max())
            curve_metrics['y_range'] = (df['Y'].min(), df['Y'].max())
            
            # Monotonic compliance check
            y_diffs = df['Y'].diff().dropna()
            violations = (y_diffs > 0.01).sum()  # Small tolerance for floating point
            curve_metrics['monotonic_compliance'] = (1 - violations / len(y_diffs)) * 100 if len(y_diffs) > 0 else 100
            
            # Coverage metrics
            expected_x_range = self.x_max - self.x_min
            actual_x_range = df['X'].max() - df['X'].min()
            curve_metrics['x_coverage'] = (actual_x_range / expected_x_range) * 100 if expected_x_range > 0 else 0
            
            expected_y_range = self.y_max - self.y_min  
            actual_y_range = df['Y'].max() - df['Y'].min()
            curve_metrics['y_coverage'] = (actual_y_range / expected_y_range) * 100 if expected_y_range > 0 else 0
            
            # Step detection (typical for KM curves)
            step_count = ((y_diffs < -1.0).sum()) if len(y_diffs) > 0 else 0  # Significant drops
            curve_metrics['step_events'] = step_count
            
            # Data density
            curve_metrics['points_per_time_unit'] = len(df) / actual_x_range if actual_x_range > 0 else 0
            
            metrics[curve_name] = curve_metrics
        
        return metrics
    
    def print_validation_summary(self):
        """Print a validation summary with metrics"""
        print("\n" + "🔍 VALIDATION SUMMARY")
        print("="*60)
        
        metrics = self.calculate_validation_metrics()
        
        if not metrics:
            print("❌ No curves to validate")
            return
        
        for curve_name, curve_metrics in metrics.items():
            print(f"\n📊 {curve_name.upper()} CURVE:")
            print(f"   Points extracted: {curve_metrics['points_extracted']}")
            print(f"   X coverage: {curve_metrics['x_coverage']:.1f}% of expected range")
            print(f"   Y coverage: {curve_metrics['y_coverage']:.1f}% of expected range")
            print(f"   Monotonic compliance: {curve_metrics['monotonic_compliance']:.1f}%")
            print(f"   Step events detected: {curve_metrics['step_events']}")
            print(f"   Data density: {curve_metrics['points_per_time_unit']:.2f} points/time unit")
            
            # Quality assessment
            quality_score = (
                min(curve_metrics['monotonic_compliance'], 100) * 0.4 +
                min(curve_metrics['x_coverage'], 100) * 0.3 +
                min(curve_metrics['y_coverage'], 100) * 0.3
            )
            
            if quality_score >= 90:
                quality_icon = "🟢"
                quality_text = "Excellent"
            elif quality_score >= 75:
                quality_icon = "🟡"
                quality_text = "Good"
            elif quality_score >= 60:
                quality_icon = "🟠"
                quality_text = "Fair"
            else:
                quality_icon = "🔴"
                quality_text = "Poor"
            
            print(f"   {quality_icon} Quality score: {quality_score:.1f}% ({quality_text})")
        
        print("="*60)
    
    def save_results(self, output_dir="output"):
        """Save extracted curves to CSV files with meaningful names and granularity"""
        print(f"💾 Saving results to {output_dir}/...")
        
        # Create output directory
        Path(output_dir).mkdir(exist_ok=True)
        
        saved_files = []
        
        # Save original extracted curves
        if self.extracted_curves:
            for i, (color, df) in enumerate(self.extracted_curves.items()):
                if len(df) > 0:
                    # Get meaningful curve name
                    curve_display_name = self.get_curve_display_name(i)
                    safe_curve_name = self.get_safe_filename(curve_display_name)
                    safe_outcome = self.get_safe_filename(self.outcome_type)
                    
                    # Create descriptive filename
                    filename = f"{output_dir}/original_{safe_curve_name}_{safe_outcome}.csv"
                    df.to_csv(filename, index=False)
                    saved_files.append(filename)
                    print(f"   ✅ {filename}")
        
        # Save monotonic filtered curves with granularity
        if self.monotonic_curves:
            for i, (color, df) in enumerate(self.monotonic_curves.items()):
                if len(df) > 0:
                    # Get meaningful curve name
                    curve_display_name = self.get_curve_display_name(i)
                    safe_curve_name = self.get_safe_filename(curve_display_name)
                    safe_outcome = self.get_safe_filename(self.outcome_type)
                    
                    # Apply granularity if specified
                    df_final = df.copy()
                    granularity_suffix = ""
                    
                    if self.output_granularity is not None:
                        print(f"   🔧 Applying granularity {self.output_granularity} to {curve_display_name}...")
                        df_resampled = self.resample_curve_data(df, self.output_granularity)
                        if not df_resampled.empty:
                            df_final = df_resampled
                            granularity_suffix = f"_gran{self.output_granularity:g}"
                            print(f"      Resampled: {len(df)} → {len(df_final)} points")
                    
                    # Ensure proper KM starting point (0, 100% or 1.0)
                    print(f"   🎯 Ensuring KM starting point for {curve_display_name}...")
                    df_final = self.ensure_km_start_point(df_final)
                    
                    # Convert to step function coordinates - THE KEY ENHANCEMENT!
                    print(f"   📊 Converting to step function for {curve_display_name}...")
                    original_count = len(df_final)
                    df_final = self.convert_to_step_function(df_final)
                    print(f"      Step conversion: {original_count} → {len(df_final)} points")
                    
                    # Convert to new CSV format: endpoint,arm,time_months,survival
                    df_standardized = pd.DataFrame({
                        'endpoint': self.outcome_type.upper(),  # OS, PFS, etc.
                        'arm': curve_display_name,  # Pembrolizumab, Chemotherapy, etc.
                        'time_months': df_final['X'],  # Time in months
                        'survival': df_final['Y'] / 100.0  # Scale from 0-100% to 0-1
                    })
                    
                    # Create descriptive filename
                    filename = f"{output_dir}/final_{safe_curve_name}_{safe_outcome}{granularity_suffix}.csv"
                    df_standardized.to_csv(filename, index=False)
                    saved_files.append(filename)
                    print(f"   ✅ {filename} (standardized format: endpoint,arm,time_months,survival)")
        
        return saved_files
    
    def convert_to_step_function(self, df):
        """
        Convert monotonic curve data to proper step function coordinates
        This implements the same logic as matplotlib's step(where='post')
        
        Args:
            df: DataFrame with X,Y columns
            
        Returns:
            DataFrame with step function coordinates
        """
        if len(df) <= 1:
            return df.copy()
        
        # Sort by X to ensure proper ordering
        df_sorted = df.sort_values('X').reset_index(drop=True)
        x = df_sorted['X'].values
        y = df_sorted['Y'].values
        
        # Create step coordinates using 'post' style
        # This matches matplotlib's step(where='post') behavior
        if len(x) == 1:
            return df_sorted.copy()
        
        # For 'post' style: horizontal line at y[i] from x[i] to x[i+1], then vertical at x[i+1]
        x_step = np.repeat(x, 2)[1:]      # [x0,x1, x1,x2, x2,x3, ...]
        y_step = np.repeat(y, 2)[:-1]     # [y0,y0, y1,y1, y2,y2, ...]
        
        # Remove redundant points (same x and y)
        if len(x_step) > 1:
            keep = np.ones_like(x_step, dtype=bool)
            keep[1:] = ~((x_step[1:] == x_step[:-1]) & (np.isclose(y_step[1:], y_step[:-1])))
            x_step, y_step = x_step[keep], y_step[keep]
        
        # Create new DataFrame
        step_df = pd.DataFrame({
            'X': x_step,
            'Y': y_step
        })
        
        # Copy any additional columns from original
        for col in df_sorted.columns:
            if col not in ['X', 'Y']:
                # For step function, we need to expand these columns too
                step_df[col] = np.repeat(df_sorted[col].values, 2)[:-1]
        
        return step_df
    
    def print_summary(self):
        """Print extraction summary"""
        print("\n" + "="*60)
        print("📈 EXTRACTION SUMMARY")
        print("="*60)
        
        print(f"📂 Image: {self.image_path}")
        print(f"🎨 Colors: {', '.join(self.colors)}")
        print(f"📊 Axis ranges: X({self.x_min}-{self.x_max}), Y({self.y_min}-{self.y_max})")
        
        if self.extracted_curves:
            print(f"\n🎯 ORIGINAL EXTRACTION:")
            for curve_name, df in self.extracted_curves.items():
                if len(df) > 0:
                    print(f"   {curve_name}: {len(df)} points")
                    print(f"     X range: {df['X'].min():.2f} - {df['X'].max():.2f}")
                    print(f"     Y range: {df['Y'].min():.2f} - {df['Y'].max():.2f}")
        
        if self.monotonic_curves:
            print(f"\n⬇️ MONOTONIC FILTERED:")
            for curve_name, df in self.monotonic_curves.items():
                if len(df) > 0:
                    original_count = len(self.extracted_curves[curve_name]) if curve_name in self.extracted_curves else 0
                    print(f"   {curve_name}: {original_count} → {len(df)} points")
                    if len(df) > 1:
                        total_drop = df['Y'].iloc[0] - df['Y'].iloc[-1]
                        print(f"     Total Y drop: {total_drop:.2f}")
        
        print("="*60)
    
    def run_full_pipeline(self, save_plots=True, save_data=True):
        """Execute the complete extraction pipeline"""
        print("🚀 Starting KM Curve Extraction Pipeline")
        print("="*60)
        
        try:
            # 1. Load image
            original, gray = self.load_image()
            
            # 2. Detect axes
            x_axis, y_axis = self.detect_axes(gray)
            
            # 3. Crop to plot area
            cropped = self.crop_to_axes(original, x_axis, y_axis)
            
            # 4. Create scaled grid
            grid = self.create_scaled_grid(cropped)
            
            # 5. Remove text (choose method based on settings)
            if hasattr(self, 'skip_text_removal') and self.skip_text_removal:
                print("⏭️ Skipping text removal (as requested)")
                processed = grid
            elif self.conservative_text_removal:
                processed = self.remove_text_conservative(grid)
            else:
                processed = self.remove_text_stage1(grid)
            
            # 6. Extract curves
            curves = self.extract_curves_with_grid_filtering(processed)
            
            # 7. Apply monotonic filtering
            monotonic_curves = self.apply_strict_monotonic_filter(curves)
            
            # 8. Generate plots
            if save_plots:
                self.plot_results(save_plots=True)
            
            # 9. Save data
            if save_data:
                self.save_results()
            
            # 10. Print summary and validation
            self.print_summary()
            self.print_validation_summary()
            
            print("✅ Pipeline completed successfully!")
            return self.extracted_curves, self.monotonic_curves
            
        except Exception as e:
            print(f"❌ Pipeline failed: {str(e)}")
            raise


def main():
    """Command line interface"""
    parser = argparse.ArgumentParser(description='Extract curves from KM plots')
    parser.add_argument('image_path', nargs='?', help='Path to the KM plot image')
    parser.add_argument('--colors', nargs='+', default=['blue', 'gray'], 
                       help='Colors to extract (default: blue gray)')
    parser.add_argument('--x-min', type=float, default=0, help='X-axis minimum (default: 0)')
    parser.add_argument('--x-max', type=float, default=80, help='X-axis maximum (default: 80)')
    parser.add_argument('--y-min', type=float, default=0, help='Y-axis minimum (default: 0)')
    parser.add_argument('--y-max', type=float, default=100, help='Y-axis maximum (default: 100)')
    parser.add_argument('--x-interval', type=float, default=10, help='X grid interval (default: 10)')
    parser.add_argument('--y-interval', type=float, default=20, help='Y grid interval (default: 20)')
    parser.add_argument('--curve-names', nargs='+', help='Names for curves (e.g., "Treatment A" "Control")')
    parser.add_argument('--outcome-type', default='survival', 
                       help='Outcome type for filename (OS, PFS, DFS, EFS, etc.) (default: survival)')
    parser.add_argument('--granularity', type=float, 
                       help='X-axis granularity for output (e.g., 0.1, 0.5, 1.0)')
    parser.add_argument('--no-plots', action='store_true', help='Skip plot generation')
    parser.add_argument('--no-save', action='store_true', help='Skip saving data files')
    parser.add_argument('--list-colors', action='store_true', help='List all available colors and exit')
    parser.add_argument('--aggressive-text-removal', action='store_true', 
                       help='Use aggressive text removal (may affect curves)')
    parser.add_argument('--no-text-removal', action='store_true',
                       help='Skip text removal entirely')
    
    args = parser.parse_args()
    
    # Handle list colors option
    if args.list_colors:
        extractor = KMCurveExtractor("dummy", [], 0, 0, 0, 0)  # Dummy values for listing
        extractor.list_available_colors()
        print("\n💡 Usage example:")
        print("python km_curve_extractor.py image.png --colors medical_blue clinical_gray")
        return
    
    # Validate required arguments
    if not args.image_path:
        parser.error("image_path is required (or use --list-colors to see available colors)")
        return
    
    # Determine text removal strategy
    conservative_text_removal = not args.aggressive_text_removal
    
    # Create extractor
    extractor = KMCurveExtractor(
        image_path=args.image_path,
        colors=args.colors,
        x_min=args.x_min,
        x_max=args.x_max,
        y_min=args.y_min,
        y_max=args.y_max,
        x_interval=args.x_interval,
        y_interval=args.y_interval,
        curve_names=args.curve_names,
        outcome_type=args.outcome_type,
        output_granularity=args.granularity,
        conservative_text_removal=conservative_text_removal
    )
    
    # Set skip text removal if requested
    if args.no_text_removal:
        extractor.skip_text_removal = True
    
    # Run pipeline
    original_curves, monotonic_curves = extractor.run_full_pipeline(
        save_plots=not args.no_plots,
        save_data=not args.no_save
    )


if __name__ == "__main__":
    main()
