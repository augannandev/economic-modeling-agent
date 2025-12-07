"""
KM Curve Extractor Module for Python Service
Comprehensive extraction of Kaplan-Meier curves from images using computer vision and LLM analysis
Based on the complete km_scripts implementation
"""

import cv2
import numpy as np
import pandas as pd
import base64
import json
import os
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path
import tempfile
from io import BytesIO
from PIL import Image
import re

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Try importing optional dependencies
try:
    import pytesseract
    PYTESSERACT_AVAILABLE = True
except ImportError:
    PYTESSERACT_AVAILABLE = False

try:
    from scipy.interpolate import interp1d
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


class KMPlotAnalyzer:
    """
    Analyzes KM plots using LLM vision capabilities to extract metadata
    """
    
    def __init__(self, api_provider: str = "anthropic", api_key: str = None):
        self.api_provider = api_provider
        self.api_key = api_key or os.environ.get(
            "ANTHROPIC_API_KEY" if api_provider == "anthropic" else "OPENAI_API_KEY"
        )
        
        if api_provider == "anthropic" and ANTHROPIC_AVAILABLE:
            self.client = anthropic.Anthropic(api_key=self.api_key)
        elif api_provider == "openai" and OPENAI_AVAILABLE:
            self.client = openai.OpenAI(api_key=self.api_key)
        else:
            self.client = None
    
    def analyze_image(self, image_base64: str) -> Dict[str, Any]:
        """
        Analyze a KM plot image using LLM vision
        
        Returns dict with:
        - curves: list of detected curves with names and colors
        - axis_ranges: x_min, x_max, y_min, y_max
        - outcome_type: OS, PFS, etc.
        - detected_arms: arm names from legend
        """
        
        prompt = """Analyze this Kaplan-Meier survival plot image and extract the following information in JSON format:

{
  "curves": [
    {
      "name": "curve name from legend",
      "color": "color name (e.g., blue, red, gray, orange)",
      "arm_type": "Treatment or Control/Comparator"
    }
  ],
  "axis_ranges": {
    "x_min": 0,
    "x_max": "max time value on x-axis",
    "y_min": 0,
    "y_max": 1.0,
    "x_unit": "months or weeks or years"
  },
  "outcome_type": "OS or PFS or DFS or EFS or other",
  "grid_intervals": {
    "x_interval": "interval between x-axis labels",
    "y_interval": "interval between y-axis labels (as decimal)"
  },
  "has_risk_table": true/false,
  "study_info": "any study name or identifier visible"
}

Be precise with the colors - use exact color names like 'blue', 'red', 'gray', 'orange', 'green', 'purple', 'black'.
For axis ranges, read the actual values from the axis labels.
"""

        if self.api_provider == "anthropic" and self.client:
            return self._analyze_with_anthropic(image_base64, prompt)
        elif self.api_provider == "openai" and self.client:
            return self._analyze_with_openai(image_base64, prompt)
        else:
            return self._default_analysis()
    
    def _analyze_with_anthropic(self, image_base64: str, prompt: str) -> Dict[str, Any]:
        """Analyze using Anthropic Claude"""
        try:
            # Remove data URL prefix if present
            if "," in image_base64:
                image_base64 = image_base64.split(",")[1]
            
            message = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": image_base64
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ]
            )
            
            response_text = message.content[0].text
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                return json.loads(response_text[json_start:json_end])
            return self._default_analysis()
            
        except Exception as e:
            print(f"Anthropic analysis error: {e}")
            return self._default_analysis()
    
    def _analyze_with_openai(self, image_base64: str, prompt: str) -> Dict[str, Any]:
        """Analyze using OpenAI GPT-4V"""
        try:
            if not image_base64.startswith("data:"):
                image_base64 = f"data:image/png;base64,{image_base64}"
            
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": image_base64}
                            }
                        ]
                    }
                ],
                max_tokens=1024
            )
            
            response_text = response.choices[0].message.content
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                return json.loads(response_text[json_start:json_end])
            return self._default_analysis()
            
        except Exception as e:
            print(f"OpenAI analysis error: {e}")
            return self._default_analysis()
    
    def _default_analysis(self) -> Dict[str, Any]:
        """Return default analysis when LLM is unavailable"""
        return {
            "curves": [
                {"name": "Treatment", "color": "blue", "arm_type": "Treatment"},
                {"name": "Control", "color": "gray", "arm_type": "Comparator"}
            ],
            "axis_ranges": {
                "x_min": 0,
                "x_max": 36,
                "y_min": 0,
                "y_max": 1.0,
                "x_unit": "months"
            },
            "outcome_type": "OS",
            "grid_intervals": {
                "x_interval": 6,
                "y_interval": 0.2
            },
            "has_risk_table": False,
            "study_info": None
        }


class KMCurveExtractor:
    """
    Extracts survival curves from KM plot images using computer vision
    Comprehensive implementation with text removal and curve protection
    """
    
    # Comprehensive color ranges for HSV detection (70+ colors)
    COLOR_RANGES = {
        # Primary colors
        'red': [([0,50,50], [10,255,255]), ([170,50,50], [180,255,255])],
        'blue': [([90,30,30], [140,255,255])],  # Broader blue range
        'green': [([40,50,50], [80,255,255])],
        # Gray spectrum (tuned for KM plots - balanced to avoid text but capture curves)
        'gray': [([0,0,30], [180,20,120])],  # Standard gray - matches original script
        'grey': [([0,0,30], [180,20,120])],  # Alias for gray
        
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
        
        # Gray spectrum (from original km_curve_extractor.py)
        'light_gray': [([0,0,120], [180,20,220])],
        'dark_gray': [([0,0,40], [180,30,120])],
        'silver': [([0,0,100], [180,15,200])],
        'charcoal': [([0,0,30], [180,40,100])],
        'clinical_gray': [([0,0,90], [180,20,170])],  # Light gray for controls
        
        # Black and white
        'black': [([0,0,0], [180,255,50])],
        'white': [([0,0,200], [180,30,255])],
        
        # Medical/publication specific colors
        'medical_blue': [([105,60,80], [125,255,255])],
        'medical_red': [([0,70,100], [10,255,255]), ([170,70,100], [180,255,255])],
        'medical_green': [([45,60,80], [75,255,255])],
        
        # Nature/Science journal colors
        'nature_blue': [([110,80,100], [130,255,255])],
        'nature_red': [([0,80,120], [10,255,255]), ([170,80,120], [180,255,255])],
        'nature_green': [([50,80,100], [70,255,255])],
        'nature_orange': [([15,80,120], [25,255,255])],
        
        # Colorblind-friendly palette
        'cb_blue': [([100,70,100], [120,255,255])],
        'cb_orange': [([10,70,120], [20,255,255])],
        'cb_green': [([45,70,100], [65,255,255])],
        'cb_pink': [([160,40,120], [180,100,255])],
        'cb_yellow': [([25,70,150], [35,255,255])],
        'cb_purple': [([135,70,100], [155,255,255])],
        
        # Pastel colors
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
    }
    
    def __init__(self, image_data: np.ndarray, colors: List[str], 
                 x_min: float, x_max: float, y_min: float, y_max: float,
                 x_interval: float = 10, y_interval: float = 20,
                 curve_names: List[str] = None, granularity: float = None,
                 conservative_text_removal: bool = True):
        """
        Initialize the curve extractor
        
        Args:
            image_data: OpenCV image array (BGR)
            colors: List of color names to extract
            x_min, x_max: X-axis range
            y_min, y_max: Y-axis range (usually 0 to 1 or 0 to 100)
            x_interval, y_interval: Grid intervals
            curve_names: Names for each curve
            granularity: Output granularity in x-axis units
            conservative_text_removal: Use conservative text removal to protect curves
        """
        self.original_image = image_data
        self.colors = colors
        self.x_min, self.x_max = x_min, x_max
        self.y_min, self.y_max = y_min, y_max
        self.x_interval = x_interval
        self.y_interval = y_interval
        self.curve_names = curve_names or [f"curve_{i}" for i in range(len(colors))]
        self.granularity = granularity
        self.conservative_text_removal = conservative_text_removal
        
        self.cropped_image = None
        self.processed_image = None
        self.extracted_curves = {}
        self.monotonic_curves = {}
        self.plot_region = None
    
    def detect_axes(self) -> Tuple[Tuple, Tuple]:
        """Detect X/Y axes using Hough Transform"""
        gray = cv2.cvtColor(self.original_image, cv2.COLOR_BGR2GRAY)
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
        
        return x_axis, y_axis
    
    def crop_to_axes(self, x_axis, y_axis) -> np.ndarray:
        """Crop image to axis boundaries"""
        if x_axis is None or y_axis is None:
            # Fallback to margins
            height, width = self.original_image.shape[:2]
            left = int(width * 0.1)
            right = int(width * 0.95)
            top = int(height * 0.05)
            bottom = int(height * 0.85)
        else:
            left = min(y_axis[0], y_axis[2])
            right = max(x_axis[0], x_axis[2])
            top = min(y_axis[1], y_axis[3])
            bottom = max(x_axis[1], x_axis[3])

        self.cropped_image = self.original_image[top:bottom, left:right]
        self.plot_region = (left, top, right, bottom)
        return self.cropped_image
    
    def _is_curve_region(self, roi: np.ndarray, hsv_roi: np.ndarray) -> bool:
        """
        Enhanced curve detection to protect curve regions from text removal
        """
        # Check for any of the colors we're extracting
        for color_name in self.colors:
            if color_name.lower() in self.COLOR_RANGES:
                for lower, upper in self.COLOR_RANGES[color_name.lower()]:
                    mask = cv2.inRange(hsv_roi, np.array(lower), np.array(upper))
                    curve_pixel_count = cv2.countNonZero(mask)
                    total_pixels = roi.shape[0] * roi.shape[1]
                    curve_percentage = curve_pixel_count / total_pixels
                    
                    if curve_percentage > 0.1:  # 10% threshold
                        return True
        
        # Additional protection for line-like structures
        gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if len(roi.shape) == 3 else roi
        edges = cv2.Canny(gray_roi, 50, 150)
        edge_pixel_count = cv2.countNonZero(edges)
        total_pixels = gray_roi.shape[0] * gray_roi.shape[1]
        edge_percentage = edge_pixel_count / total_pixels
        
        if edge_percentage > 0.05:
            return True
        
        # Check for horizontal patterns (typical of KM curves)
        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 1))
        horizontal_lines = cv2.morphologyEx(edges, cv2.MORPH_OPEN, horizontal_kernel)
        horizontal_count = cv2.countNonZero(horizontal_lines)
        
        if horizontal_count > total_pixels * 0.02:
            return True
        
        return False
    
    def remove_text(self, image: np.ndarray) -> np.ndarray:
        """Remove text from image while protecting curve regions"""
        if not PYTESSERACT_AVAILABLE:
            print("pytesseract not available, skipping text removal")
            return image
        
        grid_gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Use pytesseract to detect text
        try:
            data = pytesseract.image_to_data(grid_gray, output_type=pytesseract.Output.DICT, config='--psm 6')
        except Exception as e:
            print(f"pytesseract error: {e}")
            return image
        
        # Create mask for text regions
        mask = np.zeros(grid_gray.shape, dtype=np.uint8)
        n_boxes = len(data['level'])
        
        confidence_threshold = 90 if self.conservative_text_removal else 80
        
        for i in range(n_boxes):
            try:
                conf_val = float(data['conf'][i])
            except ValueError:
                conf_val = 0
            
            if conf_val > confidence_threshold:
                x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
                text_content = data['text'][i].strip()
                
                # Only remove if it's clearly text
                if len(text_content) > 0 and any(c.isalnum() for c in text_content):
                    roi = image[y:y+h, x:x+w]
                    hsv_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
                    
                    # Check if region contains curve pixels
                    if not self._is_curve_region(roi, hsv_roi):
                        cv2.rectangle(mask, (x, y), (x+w, y+h), 255, -1)
        
        # Inpaint to remove text
        inpaint_radius = 2 if self.conservative_text_removal else 3
        processed = cv2.inpaint(image, mask, inpaintRadius=inpaint_radius, flags=cv2.INPAINT_TELEA)
        self.processed_image = processed
        
        return processed
    
    def extract_curve_by_color(self, color: str, image: np.ndarray) -> List[Dict[str, float]]:
        """Extract curve points for a specific color with smart filtering"""
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        height, width = image.shape[:2]
        
        color_key = color.lower().replace(' ', '_')
        ranges = self.COLOR_RANGES.get(color_key)
        
        # Try common aliases
        if not ranges:
            if 'gray' in color_key or 'grey' in color_key:
                ranges = self.COLOR_RANGES.get('gray')
            elif 'blue' in color_key:
                ranges = self.COLOR_RANGES.get('blue')
            else:
                ranges = self.COLOR_RANGES.get('blue')  # Default fallback
        
        if not ranges:
            print(f"Warning: No color ranges found for '{color}'")
            return []
        
        # Create mask for this color
        mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
        for lower, upper in ranges:
            mask |= cv2.inRange(hsv, np.array(lower), np.array(upper))
        
        # Debug: check how many pixels match
        pixel_count = np.sum(mask > 0)
        print(f"  Color '{color}': {pixel_count} pixels detected in mask")
        
        # Smart filtering for gray curves to avoid text (from original km_curve_extractor.py)
        if color.lower() in ['gray', 'grey', 'light_gray', 'dark_gray', 'clinical_gray', 'charcoal', 'silver']:
            print(f"     Applying smart filtering for {color} to avoid text...")
            
            # Step 1: Apply morphological operations to remove small text artifacts
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            
            # Step 2: Connected components analysis - remove small components (likely text)
            num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
            min_area = 20  # Minimum area for curve segments (matches original)
            filtered_mask = np.zeros_like(mask)
            
            components_kept = 0
            for i in range(1, num_labels):  # Skip background (0)
                area = stats[i, cv2.CC_STAT_AREA]
                if area >= min_area:
                    # Additional check: curve-like components are more elongated
                    w = stats[i, cv2.CC_STAT_WIDTH]
                    h = stats[i, cv2.CC_STAT_HEIGHT]
                    aspect_ratio = max(w, h) / max(min(w, h), 1)
                    
                    # Keep components that are large enough OR elongated (curve-like)
                    if area >= min_area or aspect_ratio >= 2.5:
                        filtered_mask[labels == i] = 255
                        components_kept += 1
            
            mask = filtered_mask
            print(f"     Kept {components_kept} curve-like components, filtered out text artifacts")
            
            # Step 3: Hough Transform to detect and remove grid/text lines
            lines = cv2.HoughLinesP(mask, 1, np.pi/180, threshold=30, minLineLength=50, maxLineGap=10)
            if lines is not None:
                line_mask = np.zeros_like(mask)
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
                mask = cv2.bitwise_and(mask, cv2.bitwise_not(line_mask))
                print(f"     Removed {horizontal_lines} horizontal and {vertical_lines} vertical grid/text lines")
            
            print(f"  After gray filtering: {np.sum(mask > 0)} pixels")
        else:
            # Basic cleanup for non-gray colors
            kernel = np.ones((2, 2), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        
        # Extract points
        x_scale = width / (self.x_max - self.x_min)
        y_scale = height / (self.y_max - self.y_min)
        
        points = []
        # Scan column by column
        for x in range(width):
            col = mask[:, x]
            y_indices = np.where(col > 0)[0]
            
            if len(y_indices) > 0:
                # Use the topmost point (highest survival)
                y = y_indices[0]
                
                # Convert to data coordinates
                time = self.x_min + (x / x_scale)
                survival = self.y_max - (y / y_scale)
                
                points.append({
                    "time": round(time, 4),
                    "survival": round(survival, 4)
                })
        
        # Statistical cleaning for gray curves (from original km_curve_extractor.py)
        if color.lower() in ['gray', 'grey', 'light_gray', 'dark_gray', 'clinical_gray'] and len(points) > 0:
            print(f"     Statistical cleaning for {color}...")
            # Group by X (time) and take median Y for each X column (removes scattered grid points)
            df = pd.DataFrame(points)
            df_grouped = df.groupby(df['time'].round(1))['survival'].median().reset_index()
            df_grouped.columns = ['time', 'survival']
            points = df_grouped.to_dict('records')
            print(f"     After statistical cleaning: {len(points)} points")
        
        return points
    
    def apply_monotonic_filter(self, points: List[Dict]) -> List[Dict]:
        """Apply strict monotonic filtering - survival can only stay same or decrease.
        
        This matches the original km_curve_extractor.py approach:
        - Keep ALL points (don't filter any out)
        - Force monotonicity by setting survival = previous survival when it increases
        - This preserves data point count while ensuring valid KM curve
        """
        if not points or len(points) < 2:
            return points
        
        # Sort by time
        points = sorted(points, key=lambda p: p["time"])
        
        original_count = len(points)
        corrections_made = 0
        
        # STRICT MONOTONIC: survival can only stay same or decrease
        filtered = [points[0].copy()]
        
        for i in range(1, len(points)):
            current_survival = points[i]["survival"]
            previous_survival = filtered[-1]["survival"]
            
            if current_survival > previous_survival:
                # Violation: survival increased, force it to be same as previous
                filtered.append({
                    "time": points[i]["time"],
                    "survival": previous_survival
                })
                corrections_made += 1
            else:
                filtered.append(points[i].copy())
        
        print(f"     Monotonic filter: {original_count} points, {corrections_made} corrections made")
        
        return filtered
    
    def ensure_km_start_point(self, points: List[Dict]) -> List[Dict]:
        """Ensure KM curve starts at time 0 with 100% survival"""
        if not points:
            return points
        
        # Determine if percentage or probability scale
        max_survival = max(p["survival"] for p in points)
        is_percentage = max_survival > 10
        starting_survival = 100.0 if is_percentage else 1.0
        
        # Sort by time
        points = sorted(points, key=lambda p: p["time"])
        
        # Check if we have a point at time 0
        if points[0]["time"] <= 0.1:
            points[0]["time"] = 0.0
            points[0]["survival"] = starting_survival
        else:
            # Add starting point
            points.insert(0, {"time": 0.0, "survival": starting_survival})
        
        return points
    
    def convert_to_step_function(self, points: List[Dict]) -> List[Dict]:
        """Convert to proper step function coordinates (like matplotlib step where='post')"""
        if len(points) <= 1:
            return points
        
        # Sort by time
        points = sorted(points, key=lambda p: p["time"])
        
        step_points = []
        for i, point in enumerate(points):
            step_points.append(point)
            
            # Add horizontal line to next point's time
            if i < len(points) - 1:
                next_time = points[i + 1]["time"]
                step_points.append({
                    "time": next_time,
                    "survival": point["survival"]
                })
        
        # Remove consecutive duplicates
        unique_points = [step_points[0]]
        for point in step_points[1:]:
            if point["time"] != unique_points[-1]["time"] or point["survival"] != unique_points[-1]["survival"]:
                unique_points.append(point)
        
        return unique_points
    
    def resample_to_granularity(self, points: List[Dict], granularity: float) -> List[Dict]:
        """Resample points to specific time granularity using step function interpolation"""
        if not points or granularity is None:
            return points
        
        # Sort by time
        points = sorted(points, key=lambda p: p["time"])
        
        x = [p["time"] for p in points]
        y = [p["survival"] for p in points]
        
        max_time = x[-1]
        
        # Create new time grid
        new_times = np.arange(0, max_time + granularity, granularity)
        
        resampled = []
        
        if SCIPY_AVAILABLE:
            # Use step-wise interpolation (previous value carries forward)
            f = interp1d(x, y, kind='previous', bounds_error=False, 
                        fill_value=(y[0], y[-1]))
            new_survivals = f(new_times)
            
            for t, s in zip(new_times, new_survivals):
                resampled.append({
                    "time": round(float(t), 4),
                    "survival": round(float(s), 4)
                })
        else:
            # Manual step interpolation
            for t in new_times:
                # Find the survival at this time using step function
                survival = y[0]
                for i, time in enumerate(x):
                    if time <= t:
                        survival = y[i]
                    else:
                        break
                resampled.append({
                    "time": round(float(t), 4),
                    "survival": round(float(survival), 4)
                })
        
        return resampled
    
    def extract_all_curves(self) -> Dict[str, List[Dict]]:
        """Extract all curves with full pipeline
        
        Returns FULL RESOLUTION data by default. Resampling should be done
        by the caller if needed (for display or specific analysis requirements).
        """
        print(f"\n[KMCurveExtractor] Starting extraction of {len(self.colors)} curves...")
        print(f"  Colors: {self.colors}")
        print(f"  Names: {self.curve_names}")
        
        # Step 1: Detect axes and crop
        x_axis, y_axis = self.detect_axes()
        cropped = self.crop_to_axes(x_axis, y_axis)
        print(f"  Cropped image size: {cropped.shape}")
        
        # Step 2: Remove text (but keep curve pixels protected)
        processed = self.remove_text(cropped)
        
        # Step 3: Extract each color
        for color, name in zip(self.colors, self.curve_names):
            print(f"\n  Extracting '{name}' ({color})...")
            
            # Try primary color first
            points = self.extract_curve_by_color(color, processed)
            
            # If no points found, try variations
            if not points or len(points) < 5:
                print(f"    Primary extraction found only {len(points) if points else 0} points, trying variations...")
                
                # Try with original cropped image (without text removal)
                points_alt = self.extract_curve_by_color(color, cropped)
                if points_alt and len(points_alt) > len(points or []):
                    print(f"    Using original image extraction: {len(points_alt)} points")
                    points = points_alt
                
                # For gray, try additional color aliases
                if ('gray' in color.lower() or 'grey' in color.lower()) and len(points or []) < 5:
                    for alt_color in ['dark_gray', 'light_gray', 'clinical_gray', 'charcoal', 'silver']:
                        alt_points = self.extract_curve_by_color(alt_color, cropped)
                        if alt_points and len(alt_points) > len(points or []):
                            print(f"    Using alternate '{alt_color}': {len(alt_points)} points")
                            points = alt_points
                            break
            
            if not points or len(points) < 3:
                print(f"    ⚠ No usable points found for {color}")
                continue
            
            print(f"    Raw extraction: {len(points)} points")
            
            # Apply monotonic filter (preserves most data, just ensures monotonicity)
            points = self.apply_monotonic_filter(points)
            print(f"    After monotonic filter: {len(points)} points")
            
            # Ensure proper starting point
            points = self.ensure_km_start_point(points)
            
            # Store FULL RESOLUTION data (no resampling during extraction!)
            self.extracted_curves[name] = points
            self.monotonic_curves[name] = points
            
            print(f"    ✓ Successfully extracted '{name}' with {len(points)} points (full resolution)")
        
        print(f"\n[KMCurveExtractor] Extraction complete: {len(self.monotonic_curves)} curves")
        return self.monotonic_curves
    
    def get_resampled_curves(self, granularity: float) -> Dict[str, List[Dict]]:
        """Get curves resampled to specific granularity (for display or export)"""
        resampled = {}
        for name, points in self.monotonic_curves.items():
            resampled[name] = self.resample_to_granularity(points, granularity)
        return resampled
    
    def plot_results(self, output_dir: str = None, save_plots: bool = True) -> List[str]:
        """Create comprehensive visualization of results.
        
        Returns list of saved plot file paths.
        """
        import matplotlib
        matplotlib.use('Agg')  # Non-interactive backend for server
        import matplotlib.pyplot as plt
        
        print("📊 Creating result plots...")
        saved_files = []
        
        if not self.extracted_curves:
            print("❌ No curves to plot")
            return saved_files
        
        output_dir = output_dir or "/tmp"
        
        # Color mapping for visualization
        colors_map = {
            'blue': '#0066CC', 'red': '#CC0000', 'green': '#00AA00', 
            'gray': '#666666', 'grey': '#666666', 'orange': '#FF6600', 
            'purple': '#9900CC', 'black': '#000000',
            'light_blue': '#3399FF', 'dark_blue': '#003399',
            'light_gray': '#999999', 'dark_gray': '#333333',
            'medical_blue': '#0080FF', 'clinical_gray': '#808080'
        }
        
        # 1. Processing pipeline visualization (6-panel)
        fig, axes = plt.subplots(2, 3, figsize=(18, 12))
        
        # Original image
        if self.original_image is not None:
            axes[0,0].imshow(cv2.cvtColor(self.original_image, cv2.COLOR_BGR2RGB))
            axes[0,0].set_title("1. Original Image")
            axes[0,0].axis('off')
        
        # Cropped image
        if self.cropped_image is not None:
            axes[0,1].imshow(cv2.cvtColor(self.cropped_image, cv2.COLOR_BGR2RGB))
            axes[0,1].set_title("2. Cropped to Plot Area")
            axes[0,1].axis('off')
        
        # Processed image (after text removal)
        if self.processed_image is not None:
            axes[0,2].imshow(cv2.cvtColor(self.processed_image, cv2.COLOR_BGR2RGB))
            axes[0,2].set_title("3. Text Removed")
            axes[0,2].axis('off')
        
        # Raw extracted curves
        axes[1,0].set_title("4. Raw Extracted Curves")
        for curve_name, points in self.extracted_curves.items():
            if len(points) > 0:
                x = [p["time"] for p in points]
                y = [p["survival"] for p in points]
                axes[1,0].plot(x, y, 'o-', label=f'{curve_name} (n={len(points)})', markersize=2)
        axes[1,0].set_xlabel('Time')
        axes[1,0].set_ylabel('Survival')
        axes[1,0].legend()
        axes[1,0].grid(True, alpha=0.3)
        axes[1,0].set_xlim(self.x_min, self.x_max)
        axes[1,0].set_ylim(self.y_min, self.y_max)
        
        # Monotonic filtered curves
        axes[1,1].set_title("5. Monotonic Filtered Curves")
        for curve_name, points in self.monotonic_curves.items():
            if len(points) > 0:
                x = [p["time"] for p in points]
                y = [p["survival"] for p in points]
                axes[1,1].plot(x, y, 'o-', label=f'{curve_name} (n={len(points)})', markersize=2, linewidth=2)
        axes[1,1].set_xlabel('Time')
        axes[1,1].set_ylabel('Survival')
        axes[1,1].legend()
        axes[1,1].grid(True, alpha=0.3)
        axes[1,1].set_xlim(self.x_min, self.x_max)
        axes[1,1].set_ylim(self.y_min, self.y_max)
        
        # Final digitized curves (step function)
        axes[1,2].set_title("6. Final Digitized Curves (Step Function)")
        for curve_name, points in self.monotonic_curves.items():
            if len(points) > 0:
                plot_color = colors_map.get(curve_name.lower(), 'black')
                
                # Convert to step function coordinates
                step_points = self.convert_to_step_function(points)
                x_step = [p["time"] for p in step_points]
                y_step = [p["survival"] for p in step_points]
                
                # Step plot
                axes[1,2].step(x_step, y_step, where='post', color=plot_color, 
                              linewidth=2, label=f'{curve_name} ({len(points)} pts)')
                
                # Markers at original data points
                x = [p["time"] for p in points]
                y = [p["survival"] for p in points]
                axes[1,2].plot(x, y, 'o', color=plot_color, markersize=2)
        
        axes[1,2].set_xlabel('Time (months)')
        axes[1,2].set_ylabel('Survival (%)')
        axes[1,2].legend(loc='upper right', fontsize=8)
        axes[1,2].grid(True, alpha=0.3)
        axes[1,2].set_xlim(self.x_min, self.x_max)
        axes[1,2].set_ylim(self.y_min, self.y_max)
        
        plt.tight_layout()
        
        if save_plots:
            pipeline_file = os.path.join(output_dir, 'km_extraction_pipeline.png')
            plt.savefig(pipeline_file, dpi=200, bbox_inches='tight')
            saved_files.append(pipeline_file)
            print(f"   💾 Saved: {pipeline_file}")
        
        plt.close()
        
        # 2. Validation plot (side by side comparison)
        validation_file = self.create_validation_plot(output_dir, save_plots)
        if validation_file:
            saved_files.append(validation_file)
        
        # 3. Overlay plot
        overlay_file = self._create_precise_overlay_plot(output_dir, save_plots)
        if overlay_file:
            saved_files.append(overlay_file)
        
        return saved_files
    
    def create_validation_plot(self, output_dir: str = None, save_plot: bool = True) -> str:
        """Create a dedicated validation plot comparing original image with digitized curves"""
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        
        if not self.monotonic_curves or self.original_image is None:
            print("   ⚠️  Cannot create validation plot - missing data")
            return None
        
        print("📊 Creating enhanced validation plot...")
        output_dir = output_dir or "/tmp"
        
        colors_map = {
            'blue': '#0066CC', 'red': '#CC0000', 'green': '#00AA00', 
            'gray': '#666666', 'grey': '#666666', 'orange': '#FF6600', 
            'purple': '#9900CC', 'black': '#000000',
            'light_blue': '#3399FF', 'dark_blue': '#003399',
            'light_gray': '#999999', 'dark_gray': '#333333',
            'medical_blue': '#0080FF', 'clinical_gray': '#808080'
        }
        
        fig = plt.figure(figsize=(20, 10))
        
        # Left: Original image (larger, 2/3 width)
        ax1 = plt.subplot(1, 3, (1, 2))
        ax1.imshow(cv2.cvtColor(self.original_image, cv2.COLOR_BGR2RGB))
        ax1.set_title("Original KM Plot", fontsize=16, fontweight='bold', pad=20)
        ax1.axis('off')
        
        # Right: Digitized curves only (cleaner)
        ax2 = plt.subplot(1, 3, 3)
        
        curve_count = 0
        for curve_name, points in self.monotonic_curves.items():
            if len(points) > 0:
                curve_count += 1
                plot_color = colors_map.get(curve_name.lower(), 'black')
                
                # Convert to step function coordinates
                step_points = self.convert_to_step_function(points)
                x_step = [p["time"] for p in step_points]
                y_step = [p["survival"] for p in step_points]
                
                ax2.step(x_step, y_step, where='post', color=plot_color, linewidth=3,
                        label=f'{curve_name} ({len(points)} pts)', alpha=0.9)
                
                # Markers at original data points
                x = [p["time"] for p in points]
                y = [p["survival"] for p in points]
                ax2.plot(x, y, 'o', color=plot_color, markersize=4,
                        markeredgecolor='white', markeredgewidth=1)
        
        ax2.set_title("Extracted Curves", fontsize=16, fontweight='bold', pad=20)
        ax2.set_xlabel('Time (months)', fontsize=12)
        ax2.set_ylabel('Survival (%)', fontsize=12)
        ax2.legend(loc='upper right', framealpha=0.9, fontsize=11)
        ax2.grid(True, alpha=0.3, linestyle='--')
        ax2.set_xlim(self.x_min, self.x_max)
        ax2.set_ylim(self.y_min, self.y_max)
        
        # Add extraction summary statistics
        total_points = sum(len(pts) for pts in self.monotonic_curves.values())
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
        
        validation_file = None
        if save_plot:
            validation_file = os.path.join(output_dir, 'km_validation_comparison.png')
            plt.savefig(validation_file, dpi=200, bbox_inches='tight')
            print(f"   💾 Saved: {validation_file}")
        
        plt.close()
        return validation_file
    
    def _create_precise_overlay_plot(self, output_dir: str = None, save_plot: bool = True) -> str:
        """Create a precise overlay plot using the cropped image area"""
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        
        if self.cropped_image is None or not self.monotonic_curves:
            return None
        
        print("📊 Creating precise overlay validation...")
        output_dir = output_dir or "/tmp"
        
        colors_map = {
            'blue': '#0000FF', 'red': '#FF0000', 'green': '#00AA00', 
            'gray': '#666666', 'grey': '#666666', 'orange': '#FF6600', 
            'purple': '#9900CC', 'black': '#000000'
        }
        
        fig, ax = plt.subplots(1, 1, figsize=(12, 8))
        
        # Use the cropped image with proper scaling
        ax.imshow(cv2.cvtColor(self.cropped_image, cv2.COLOR_BGR2RGB), 
                 extent=[self.x_min, self.x_max, self.y_min, self.y_max], 
                 aspect='auto', alpha=0.85)
        
        # Overlay curves with high visibility
        for curve_name, points in self.monotonic_curves.items():
            if len(points) > 0:
                plot_color = colors_map.get(curve_name.lower(), 'yellow')
                
                # Convert to step function coordinates
                step_points = self.convert_to_step_function(points)
                x_step = [p["time"] for p in step_points]
                y_step = [p["survival"] for p in step_points]
                
                # White outline + colored line for visibility
                ax.plot(x_step, y_step, '-', color='white', linewidth=6, alpha=0.8)
                ax.plot(x_step, y_step, '-', color=plot_color, linewidth=4, alpha=1.0,
                       label=f'{curve_name} (step function)')
                
                # Markers at significant survival drops
                survivals = [p["survival"] for p in points]
                for i in range(1, len(points)):
                    if survivals[i-1] - survivals[i] > 1:  # Significant drop
                        ax.plot(points[i]["time"], points[i]["survival"], 'o', 
                               color=plot_color, markersize=6,
                               markeredgecolor='white', markeredgewidth=2)
        
        ax.set_title("Precision Validation: Digitized Curves on Original Plot", 
                    fontsize=14, fontweight='bold')
        ax.set_xlabel('Time (months)', fontsize=12)
        ax.set_ylabel('Survival (%)', fontsize=12)
        ax.legend(loc='upper right', framealpha=0.9)
        ax.grid(True, alpha=0.3, linestyle=':', color='yellow')
        ax.set_xlim(self.x_min, self.x_max)
        ax.set_ylim(self.y_min, self.y_max)
        
        plt.tight_layout()
        
        overlay_file = None
        if save_plot:
            overlay_file = os.path.join(output_dir, 'km_precision_overlay.png')
            plt.savefig(overlay_file, dpi=200, bbox_inches='tight')
            print(f"   💾 Saved: {overlay_file}")
        
        plt.close()
        return overlay_file
    
    def calculate_validation_metrics(self) -> Dict[str, Dict]:
        """Calculate validation metrics for the extraction"""
        if not self.monotonic_curves:
            return {}
        
        metrics = {}
        
        for curve_name, points in self.monotonic_curves.items():
            if len(points) == 0:
                continue
            
            curve_metrics = {}
            
            # Basic statistics
            times = [p["time"] for p in points]
            survivals = [p["survival"] for p in points]
            
            curve_metrics['points_extracted'] = len(points)
            curve_metrics['x_range'] = (min(times), max(times))
            curve_metrics['y_range'] = (min(survivals), max(survivals))
            
            # Monotonic compliance check
            violations = 0
            for i in range(1, len(survivals)):
                if survivals[i] > survivals[i-1] + 0.01:  # Small tolerance
                    violations += 1
            
            curve_metrics['monotonic_compliance'] = (1 - violations / (len(survivals) - 1)) * 100 if len(survivals) > 1 else 100
            
            # Coverage metrics
            expected_x_range = self.x_max - self.x_min
            actual_x_range = max(times) - min(times)
            curve_metrics['x_coverage'] = (actual_x_range / expected_x_range) * 100 if expected_x_range > 0 else 0
            
            metrics[curve_name] = curve_metrics
        
        return metrics


class KMRiskTableExtractor:
    """
    Extracts risk table data from KM plot images using LLM vision
    """
    
    def __init__(self, api_provider: str = "anthropic", api_key: str = None):
        self.api_provider = api_provider
        self.api_key = api_key or os.environ.get(
            "ANTHROPIC_API_KEY" if api_provider == "anthropic" else "OPENAI_API_KEY"
        )
        
        if api_provider == "anthropic" and ANTHROPIC_AVAILABLE:
            self.client = anthropic.Anthropic(api_key=self.api_key)
        elif api_provider == "openai" and OPENAI_AVAILABLE:
            self.client = openai.OpenAI(api_key=self.api_key)
        else:
            self.client = None
    
    def extract_risk_table(self, image_base64: str) -> Dict[str, Any]:
        """Extract risk table data from image"""
        
        prompt = """Analyze this Kaplan-Meier survival plot image and extract the "Number at Risk" table data.

Return the data in this exact JSON format:
{
  "risk_table_detected": true,
  "time_points": [0, 6, 12, 18, 24, 30, 36],
  "groups": [
    {
      "name": "Group Name 1 (from legend)",
      "color_reference": "blue",
      "risk_data": {
        "0": 100,
        "6": 85,
        "12": 72,
        "18": 60,
        "24": 45,
        "30": 30,
        "36": 15
      }
    },
    {
      "name": "Group Name 2 (from legend)",
      "color_reference": "gray",
      "risk_data": {
        "0": 100,
        "6": 80,
        "12": 65,
        "18": 50,
        "24": 35,
        "30": 20,
        "36": 10
      }
    }
  ],
  "units": "months"
}

If no risk table is found, return:
{
  "risk_table_detected": false,
  "reason": "No risk table found in image"
}

Be precise with number recognition - medical data requires accuracy.
Match group names with the legend of the survival curves.
Numbers should generally decrease over time (patients dropping out).
"""

        if self.api_provider == "anthropic" and self.client:
            return self._extract_with_anthropic(image_base64, prompt)
        elif self.api_provider == "openai" and self.client:
            return self._extract_with_openai(image_base64, prompt)
        else:
            return {"risk_table_detected": False, "reason": "No LLM client available"}
    
    def _extract_with_anthropic(self, image_base64: str, prompt: str) -> Dict[str, Any]:
        """Extract using Anthropic Claude"""
        try:
            if "," in image_base64:
                image_base64 = image_base64.split(",")[1]
            
            message = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2048,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": image_base64
                                }
                            },
                            {"type": "text", "text": prompt}
                        ]
                    }
                ]
            )
            
            response_text = message.content[0].text
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                return json.loads(response_text[json_start:json_end])
            return {"risk_table_detected": False, "reason": "Could not parse response"}
            
        except Exception as e:
            return {"risk_table_detected": False, "reason": str(e)}
    
    def _extract_with_openai(self, image_base64: str, prompt: str) -> Dict[str, Any]:
        """Extract using OpenAI GPT-4V"""
        try:
            if not image_base64.startswith("data:"):
                image_base64 = f"data:image/png;base64,{image_base64}"
            
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": image_base64}}
                        ]
                    }
                ],
                max_tokens=2048
            )
            
            response_text = response.choices[0].message.content
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                return json.loads(response_text[json_start:json_end])
            return {"risk_table_detected": False, "reason": "Could not parse response"}
            
        except Exception as e:
            return {"risk_table_detected": False, "reason": str(e)}
    
    def convert_to_structured(self, risk_data: Dict) -> List[Dict]:
        """Convert risk table data to structured format for API response (first group only)"""
        if not risk_data.get("risk_table_detected", False):
            return []
        
        result = []
        time_points = risk_data.get("time_points", [])
        groups = risk_data.get("groups", [])
        
        if groups:
            first_group = groups[0]
            risk_values = first_group.get("risk_data", {})
            
            for t in time_points:
                time_str = str(t)
                at_risk = risk_values.get(time_str, 0)
                result.append({
                    "time": float(t),
                    "atRisk": int(at_risk) if at_risk else 0,
                    "events": 0
                })
        
        return result
    
    def convert_to_per_arm(self, risk_data: Dict, curve_names: List[str], curve_colors: List[str]) -> Dict[str, List[Dict]]:
        """
        Convert risk table data to per-arm format, matching by name or color
        
        Returns:
            Dict mapping arm name -> list of {time, atRisk, events}
        """
        if not risk_data.get("risk_table_detected", False):
            return {}
        
        result = {}
        time_points = risk_data.get("time_points", [])
        groups = risk_data.get("groups", [])
        
        for group in groups:
            group_name = group.get("name", "Unknown")
            group_color = group.get("color_reference", "").lower()
            risk_values = group.get("risk_data", {})
            
            # Build risk table entries for this group
            risk_entries = []
            for t in time_points:
                time_str = str(t)
                at_risk = risk_values.get(time_str, 0)
                risk_entries.append({
                    "time": float(t),
                    "atRisk": int(at_risk) if at_risk else 0,
                    "events": 0
                })
            
            # Try to match to curve by name similarity or color
            matched_name = self._match_group_to_curve(group_name, group_color, curve_names, curve_colors)
            result[matched_name] = risk_entries
        
        return result
    
    def _match_group_to_curve(self, group_name: str, group_color: str, curve_names: List[str], curve_colors: List[str]) -> str:
        """Match risk table group to extracted curve by name or color"""
        group_name_lower = group_name.lower()
        group_color_lower = group_color.lower()
        
        # First try exact name match
        for name in curve_names:
            if name.lower() == group_name_lower:
                return name
        
        # Try partial name match
        for name in curve_names:
            if group_name_lower in name.lower() or name.lower() in group_name_lower:
                return name
        
        # Try color match
        for i, color in enumerate(curve_colors):
            if color.lower() == group_color_lower:
                if i < len(curve_names):
                    return curve_names[i]
        
        # Fallback to group name
        return group_name


class IPDBuilder:
    """
    Reconstructs individual patient data using the Guyot et al. 2012 method
    """
    
    def __init__(self):
        self.validation_enabled = True
    
    def reconstruct_ipd_guyot(
        self, 
        km_points: List[Dict],
        atrisk_points: List[Dict],
        arm_name: str = "Treatment"
    ) -> Dict[str, Any]:
        """
        Reconstruct individual patient data using Guyot method
        
        Args:
            km_points: List of {time, survival} dicts
            atrisk_points: List of {time, atRisk} dicts
            arm_name: Treatment arm name
            
        Returns:
            Dict with IPD data and summary statistics
        """
        if not km_points:
            return {"success": False, "error": "No KM points provided"}
        
        import pandas as pd
        
        print(f"[IPDBuilder] Starting Guyot reconstruction for {arm_name}")
        print(f"[IPDBuilder] Input: {len(km_points)} KM points, {len(atrisk_points) if atrisk_points else 0} at-risk points")
        
        # Convert to DataFrames - handle both field naming conventions
        km_df = pd.DataFrame(km_points)
        
        # Normalize field names (backend may send time_months instead of time)
        if "time_months" in km_df.columns and "time" not in km_df.columns:
            km_df = km_df.rename(columns={"time_months": "time"})
        
        km_df = km_df.sort_values("time").reset_index(drop=True)
        
        # Check if survival is in percentage form (>1) and convert to proportion
        max_survival = km_df["survival"].max()
        min_survival = km_df["survival"].min()
        print(f"[IPDBuilder] Original survival range: {min_survival:.4f} - {max_survival:.4f}")
        
        if max_survival > 1.5:  # Likely percentage
            print(f"[IPDBuilder] Converting survival from percentage to proportion (max={max_survival})")
            km_df["survival"] = km_df["survival"] / 100.0
            max_survival = km_df["survival"].max()
            min_survival = km_df["survival"].min()
            print(f"[IPDBuilder] After conversion: {min_survival:.4f} - {max_survival:.4f}")
        
        # Filter to only keep points where survival actually changes (event times)
        # This is critical for the Guyot method to work correctly
        survival_diff = km_df["survival"].diff().abs()
        survival_diff.iloc[0] = 1  # Keep first point
        # Keep points where survival changed by at least 0.001 (0.1%)
        event_mask = survival_diff >= 0.001
        original_count = len(km_df)
        km_df_filtered = km_df[event_mask].reset_index(drop=True)
        print(f"[IPDBuilder] Filtered to {len(km_df_filtered)} event-time points (from {original_count})")
        
        # If filtering removed too much, use original
        if len(km_df_filtered) < 3:
            print(f"[IPDBuilder] Warning: Too few points after filtering, using original data")
            km_df_filtered = km_df
        
        # Use filtered data for reconstruction
        km_df = km_df_filtered
        
        if atrisk_points:
            atrisk_df = pd.DataFrame(atrisk_points)
            
            # Normalize field names (backend may send time_months/at_risk instead of time/atRisk)
            rename_map = {}
            if "time_months" in atrisk_df.columns and "time" not in atrisk_df.columns:
                rename_map["time_months"] = "time"
            if "at_risk" in atrisk_df.columns and "atRisk" not in atrisk_df.columns:
                rename_map["at_risk"] = "atRisk"
            
            if rename_map:
                atrisk_df = atrisk_df.rename(columns=rename_map)
                print(f"[IPDBuilder] Normalized at-risk field names: {rename_map}")
            
            atrisk_df = atrisk_df.sort_values("time")
            print(f"[IPDBuilder] At-risk data columns: {list(atrisk_df.columns)}")
            print(f"[IPDBuilder] At-risk data sample: {atrisk_df.head(3).to_dict('records')}")
        else:
            atrisk_df = pd.DataFrame()
        
        # Align at-risk data with KM timepoints
        km_df = self._align_atrisk_data(km_df, atrisk_df)
        
        # Get initial number at risk
        if 0.0 not in km_df["time"].values:
            first_idx = km_df["time"].idxmin()
            first_survival = km_df.loc[first_idx, "survival"]
            first_nrisk = km_df.loc[first_idx, "n_risk"]
            initial_n = int(first_nrisk / first_survival) if first_survival > 0 else int(first_nrisk)
        else:
            initial_n = int(km_df[km_df["time"] == 0.0]["n_risk"].iloc[0])
        
        print(f"[IPDBuilder] Initial N at risk: {initial_n}")
        
        # Guyot reconstruction
        times = km_df["time"].values
        survival = km_df["survival"].values
        n_risk = km_df["n_risk"].values
        
        print(f"[IPDBuilder] Survival range: {survival.min():.4f} - {survival.max():.4f}")
        print(f"[IPDBuilder] N_risk range: {n_risk.min()} - {n_risk.max()}")
        
        # Calculate events with fractional accumulation (don't round until the end)
        n_events_float = []
        n_censored_float = []
        
        for i in range(len(times) - 1):
            t_curr, s_curr, nr_curr = times[i], survival[i], n_risk[i]
            t_next, s_next, nr_next = times[i + 1], survival[i + 1], n_risk[i + 1]
            
            # Number of events in interval [t_curr, t_next)
            if s_curr > 0:
                d = nr_curr * (1 - s_next / s_curr)
            else:
                d = 0
            
            # Number censored in interval
            c = nr_curr - nr_next - d
            
            n_events_float.append(max(0, d))
            n_censored_float.append(max(0, c))
        
        # Final interval - all remaining are censored
        n_events_float.append(0)
        n_censored_float.append(float(n_risk[-1]))
        
        # Debug: show total float events before rounding
        total_float_events = sum(n_events_float)
        total_float_censored = sum(n_censored_float)
        print(f"[IPDBuilder] Float events: {total_float_events:.2f}, Float censored: {total_float_censored:.2f}")
        
        # If total float events is very low, the data might not have meaningful drops
        if total_float_events < 1:
            print(f"[IPDBuilder] WARNING: Very low event count ({total_float_events:.4f})")
            print(f"[IPDBuilder] This may indicate survival values are too similar or data issues")
            # Calculate expected events from survival drop: events ≈ initial_n * (1 - final_survival)
            expected_events = initial_n * (1 - survival[-1])
            print(f"[IPDBuilder] Expected events from survival drop: {expected_events:.2f}")
        
        # Now round, but use probabilistic rounding for fractional events
        # This preserves the expected total number of events
        n_events = []
        n_censored = []
        accumulated_event_fraction = 0.0
        accumulated_censor_fraction = 0.0
        
        for d_float, c_float in zip(n_events_float, n_censored_float):
            # Accumulate fractions
            accumulated_event_fraction += d_float
            accumulated_censor_fraction += c_float
            
            # Take integer part
            d_int = int(accumulated_event_fraction)
            c_int = int(accumulated_censor_fraction)
            
            n_events.append(d_int)
            n_censored.append(c_int)
            
            # Keep fractional remainder
            accumulated_event_fraction -= d_int
            accumulated_censor_fraction -= c_int
        
        total_events = sum(n_events)
        total_censored = sum(n_censored)
        print(f"[IPDBuilder] Final integer events: {total_events}, censored: {total_censored}")
        
        # Generate patient records
        patient_records = []
        patient_id = 0
        
        for i, (t, n_evt, n_cens) in enumerate(zip(times, n_events, n_censored)):
            if i < len(times) - 1:
                interval_length = times[i + 1] - t
                
                for _ in range(n_evt):
                    event_time = t + np.random.uniform(0, interval_length)
                    patient_records.append({
                        "patient_id": patient_id,
                        "time": event_time,
                        "event": 1,
                        "arm": arm_name,
                    })
                    patient_id += 1
            
            for _ in range(n_cens):
                patient_records.append({
                    "patient_id": patient_id,
                    "time": t,
                    "event": 0,
                    "arm": arm_name,
                })
                patient_id += 1
        
        ipd_df = pd.DataFrame(patient_records)
        
        # Normalize to target population
        ipd_df = self._normalize_population(ipd_df, initial_n, arm_name)
        
        return {
            "success": True,
            "data": ipd_df.to_dict('records'),
            "summary": {
                "n_patients": len(ipd_df),
                "n_events": int(ipd_df["event"].sum()),
                "n_censored": int((ipd_df["event"] == 0).sum()),
                "median_followup": float(ipd_df["time"].median()),
                "arm": arm_name
            }
        }
    
    def _align_atrisk_data(self, km_df, atrisk_df):
        """Align at-risk data with KM timepoints using hybrid approach.
        
        Uses linear interpolation between known at-risk values and constrains
        n_risk to be monotonically non-increasing and consistent with survival.
        """
        import pandas as pd
        
        if atrisk_df.empty:
            # Estimate from survival - use initial population of 100 (or infer from context)
            km_df_copy = km_df.copy()
            # Assume 100% survival at time 0 means initial_n patients
            max_survival = km_df_copy["survival"].max()
            if max_survival > 0:
                initial_n = 100  # Default assumption
                km_df_copy["n_risk"] = (initial_n * km_df_copy["survival"] / max_survival).round().astype(int)
            else:
                km_df_copy["n_risk"] = 100
            print(f"[IPDBuilder] No at-risk data - estimating from survival curve")
            return km_df_copy
        
        km_df_copy = km_df.copy().sort_values("time").reset_index(drop=True)
        atrisk_times = atrisk_df["time"].values
        atrisk_nrisk = atrisk_df["atRisk"].values
        
        # For each KM timepoint, estimate the number at risk
        estimated_nrisk = []
        for km_time in km_df_copy["time"]:
            if km_time in atrisk_times:
                # Exact match - use the actual at-risk value
                idx = np.where(atrisk_times == km_time)[0][0]
                n_risk = atrisk_nrisk[idx]
            else:
                # Interpolate between known at-risk values
                n_risk = np.interp(km_time, atrisk_times, atrisk_nrisk)
                n_risk = max(0, round(n_risk))
            estimated_nrisk.append(n_risk)
        
        km_df_copy["n_risk"] = estimated_nrisk
        
        # Ensure n_risk is monotonically non-increasing (patients can only leave, not join)
        km_df_copy["n_risk"] = km_df_copy["n_risk"].cummin()
        
        # Additional constraint: n_risk should be consistent with survival
        # If survival drops dramatically but n_risk doesn't, adjust n_risk
        initial_n = km_df_copy["n_risk"].iloc[0]
        for i in range(len(km_df_copy)):
            survival = km_df_copy["survival"].iloc[i]
            # Rough estimate: n_risk shouldn't be much higher than survival * initial_n
            max_reasonable_nrisk = max(1, survival * initial_n * 1.2)  # 20% buffer
            if km_df_copy["n_risk"].iloc[i] > max_reasonable_nrisk:
                km_df_copy.iloc[i, km_df_copy.columns.get_loc("n_risk")] = round(max_reasonable_nrisk)
        
        # Final monotonicity check
        km_df_copy["n_risk"] = km_df_copy["n_risk"].cummin()
        
        print(f"[IPDBuilder] Aligned {len(km_df_copy)} KM timepoints with at-risk data")
        print(f"[IPDBuilder] At-risk range: {km_df_copy['n_risk'].iloc[0]} → {km_df_copy['n_risk'].iloc[-1]} patients")
        
        return km_df_copy
    
    def _normalize_population(self, ipd_df, target_n: int, arm_name: str):
        """Normalize IPD to exact study population size"""
        import pandas as pd
        
        current_n = len(ipd_df)
        
        if current_n == target_n:
            return ipd_df
        
        if current_n > target_n:
            # Remove excess proportionally
            excess = current_n - target_n
            events_df = ipd_df[ipd_df['event'] == 1].copy()
            censored_df = ipd_df[ipd_df['event'] == 0].copy()
            
            event_ratio = len(events_df) / current_n if current_n > 0 else 0
            events_to_remove = min(int(round(excess * event_ratio)), len(events_df))
            censored_to_remove = min(excess - events_to_remove, len(censored_df))
            
            if events_to_remove > 0 and len(events_df) > 0:
                events_df = events_df.sample(n=len(events_df) - events_to_remove, random_state=42)
            if censored_to_remove > 0 and len(censored_df) > 0:
                censored_df = censored_df.sample(n=len(censored_df) - censored_to_remove, random_state=42)
            
            ipd_df = pd.concat([events_df, censored_df], ignore_index=True)
            
        elif current_n < target_n:
            # Add more by duplicating with time variation
            deficit = target_n - current_n
            if len(ipd_df) > 0:
                duplicates = ipd_df.sample(n=deficit, replace=True, random_state=42).copy()
                time_noise = np.random.normal(0, 0.01, len(duplicates))
                duplicates['time'] = np.maximum(duplicates['time'] + time_noise, 0.001)
                duplicates['patient_id'] = range(current_n, current_n + len(duplicates))
                ipd_df = pd.concat([ipd_df, duplicates], ignore_index=True)
        
        return ipd_df.sort_values('time').reset_index(drop=True)


def extract_km_from_base64(
    image_base64: str,
    risk_table_image_base64: str = None,
    granularity: float = 0.25,
    endpoint_type: str = "OS",
    arm: str = "Treatment",
    api_provider: str = "anthropic"
) -> Dict[str, Any]:
    """
    Main extraction function for the API
    
    Args:
        image_base64: Base64 encoded KM plot image
        risk_table_image_base64: Optional separate risk table image
        granularity: Output time granularity
        endpoint_type: OS, PFS, DFS, etc.
        arm: Treatment, Comparator, Control
        api_provider: "anthropic" or "openai"
    
    Returns:
        {
            "success": bool,
            "points": [{"time": float, "survival": float, "id": str}],
            "riskTable": [{"time": float, "atRisk": int, "events": int}],
            "axisRanges": {"xMin": float, "xMax": float, "yMin": float, "yMax": float},
            "metadata": {...}
        }
    """
    try:
        # Decode image
        if "," in image_base64:
            image_data = base64.b64decode(image_base64.split(",")[1])
        else:
            image_data = base64.b64decode(image_base64)
        
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {"success": False, "error": "Failed to decode image"}
        
        # Step 1: Analyze with LLM
        analyzer = KMPlotAnalyzer(api_provider=api_provider)
        analysis = analyzer.analyze_image(image_base64)
        
        # Step 2: Extract parameters
        curves_info = analysis.get("curves", [])
        colors = [c.get("color", "blue") for c in curves_info]
        curve_names = [c.get("name", f"Curve {i}") for i, c in enumerate(curves_info)]
        
        axis_ranges = analysis.get("axis_ranges", {})
        x_min = float(axis_ranges.get("x_min", 0))
        x_max = float(axis_ranges.get("x_max", 36))
        y_min = float(axis_ranges.get("y_min", 0))
        y_max = float(axis_ranges.get("y_max", 1))
        
        grid_intervals = analysis.get("grid_intervals", {})
        x_interval = float(grid_intervals.get("x_interval", 6))
        y_interval = float(grid_intervals.get("y_interval", 0.2))
        
        # Step 3: Extract curves (FULL RESOLUTION - no resampling during extraction)
        extractor = KMCurveExtractor(
            image_data=img,
            colors=colors if colors else ["blue"],
            x_min=x_min,
            x_max=x_max,
            y_min=y_min,
            y_max=y_max,
            x_interval=x_interval,
            y_interval=y_interval,
            curve_names=curve_names,
            granularity=None  # Don't resample during extraction - keep full resolution
        )
        
        # Get full resolution curves
        extracted_curves = extractor.extract_all_curves()
        
        # Also prepare resampled version if granularity specified
        resampled_curves = None
        if granularity and granularity > 0:
            resampled_curves = extractor.get_resampled_curves(granularity)
            print(f"[KMExtractor] Also prepared resampled curves at granularity={granularity}")
        
        # Step 4: Extract risk table (use separate risk table image if provided)
        risk_table = []
        risk_per_arm = {}
        risk_image = risk_table_image_base64 or image_base64
        risk_extractor = KMRiskTableExtractor(api_provider=api_provider)
        risk_result = risk_extractor.extract_risk_table(risk_image)
        
        if risk_result.get("risk_table_detected"):
            # Get risk table per arm
            risk_per_arm = risk_extractor.convert_to_per_arm(risk_result, curve_names, colors)
            # Also get flat list for backwards compatibility
            risk_table = risk_extractor.convert_to_structured(risk_result)
            print(f"[KMExtractor] Risk table detected with {len(risk_result.get('groups', []))} groups")
            print(f"[KMExtractor] Risk per arm: {list(risk_per_arm.keys())}")
        else:
            print(f"[KMExtractor] No risk table detected: {risk_result.get('reason', 'unknown')}")
        
        # Build curves data - include ALL curves with their risk tables
        all_curves = []
        all_points = []  # For backwards compatibility - points from first curve
        
        for i, (name, curve_points) in enumerate(extracted_curves.items()):
            color = colors[i] if i < len(colors) else "unknown"
            detected_name = curve_names[i] if i < len(curve_names) else f"Curve {i+1}"
            
            # Points for this curve (FULL RESOLUTION)
            curve_point_list = []
            for j, p in enumerate(curve_points):
                point = {
                    "time": p["time"],
                    "survival": p["survival"],
                    "id": f"curve{i}_{j}",
                }
                curve_point_list.append(point)
                
                # Also add to all_points for backwards compatibility
                all_points.append({
                    **point,
                    "curve": detected_name,
                    "curveIndex": i
                })
            
            # Get resampled points for this curve (if granularity specified)
            resampled_point_list = None
            if resampled_curves and detected_name in resampled_curves:
                resampled_point_list = []
                for j, p in enumerate(resampled_curves[detected_name]):
                    resampled_point_list.append({
                        "time": p["time"],
                        "survival": p["survival"],
                        "id": f"curve{i}_rs_{j}",
                    })
            
            # Find matching risk table for this arm
            arm_risk_table = risk_per_arm.get(detected_name, [])
            # Also try matching by color if name didn't match
            if not arm_risk_table:
                for arm_name, risk_data in risk_per_arm.items():
                    if arm_name.lower() in detected_name.lower() or detected_name.lower() in arm_name.lower():
                        arm_risk_table = risk_data
                        break
            
            # Add curve to curves array with its risk table
            all_curves.append({
                "id": f"curve_{i}",
                "name": detected_name,
                "color": color,
                "points": curve_point_list,  # Full resolution points
                "resampledPoints": resampled_point_list,  # Resampled points (if granularity specified)
                "riskTable": arm_risk_table,  # Risk table specific to this arm
            })
        
        # For backwards compatibility, also provide flat points list (first curve only)
        first_curve_points = all_curves[0]["points"] if all_curves else []
        
        # Step 5: Generate validation plots (optional, can be used for debugging/verification)
        validation_plots = []
        try:
            import tempfile
            plot_dir = tempfile.mkdtemp(prefix="km_validation_")
            validation_plots = extractor.plot_results(output_dir=plot_dir, save_plots=True)
            print(f"[KMExtractor] Generated {len(validation_plots)} validation plots")
        except Exception as plot_error:
            print(f"[KMExtractor] Warning: Could not generate validation plots: {plot_error}")
        
        # Build metadata with all arm names
        total_points = sum(len(c["points"]) for c in all_curves)
        metadata = {
            "detectedArmName": curve_names[0] if curve_names else None,
            "detectedArmNames": curve_names,  # ALL detected arm names
            "detectedEndpointType": analysis.get("outcome_type", endpoint_type),
            "numCurves": len(extracted_curves),
            "curveColors": colors,
            "hasRiskTable": risk_result.get("risk_table_detected", False),
            "studyInfo": analysis.get("study_info"),
            "xUnit": axis_ranges.get("x_unit", "months"),
            "totalPoints": total_points,  # Full resolution point count
            "granularity": granularity,  # Requested granularity (if any)
            "validationPlots": validation_plots,  # Paths to validation plot images
        }
        
        print(f"[KMExtractor] Returning {len(all_curves)} curves with {total_points} total points (full resolution)")
        
        return {
            "success": True,
            "points": first_curve_points,  # Backwards compatible - first curve
            "allPoints": all_points,  # All points with curve info
            "curves": all_curves,  # Structured curves array
            "riskTable": risk_table,
            "axisRanges": {
                "xMin": x_min,
                "xMax": x_max,
                "yMin": y_min,
                "yMax": y_max
            },
            "metadata": metadata,
            "validationPlots": validation_plots  # Also at top level for easy access
        }
        
    except Exception as e:
        import traceback
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }


def generate_ipd_from_km(
    km_data: List[Dict],
    atrisk_data: List[Dict],
    endpoint_type: str = "OS",
    arm: str = "Treatment"
) -> Dict[str, Any]:
    """
    Generate pseudo-IPD from KM curve data
    
    Args:
        km_data: List of {time, survival} points
        atrisk_data: List of {time, atRisk} points
        endpoint_type: OS, PFS, etc.
        arm: Treatment arm name
        
    Returns:
        {
            "success": bool,
            "ipd": [...],
            "summary": {...}
        }
    """
    try:
        builder = IPDBuilder()
        result = builder.reconstruct_ipd_guyot(km_data, atrisk_data, arm)
        
        if not result.get("success"):
            return result
        
        return {
            "success": True,
            "ipd": result["data"],
            "summary": result["summary"],
            "endpoint": endpoint_type,
            "arm": arm
        }
        
    except Exception as e:
        import traceback
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }
