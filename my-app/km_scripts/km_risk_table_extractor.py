#!/usr/bin/env python3
"""
KM Risk Table Extractor - AI-powered risk table extraction
Uses LLM vision capabilities to extract "Number at Risk" tables from KM plots
"""

import base64
import json
import re
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
from pathlib import Path
import argparse

# LLM API imports (reuse from km_llm_analyzer)
try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

class KMRiskTableExtractor:
    """
    AI-powered extractor for "Number at Risk" tables from KM survival plots
    """
    
    def __init__(self, api_provider="openai", api_key=None, model=None):
        """
        Initialize the risk table extractor
        
        Args:
            api_provider: "openai", "anthropic", or "local"
            api_key: API key for the provider
            model: Model name (optional, uses defaults)
        """
        self.api_provider = api_provider.lower()
        self.api_key = api_key
        
        # Default models
        self.models = {
            "openai": model or "gpt-4o",
            "anthropic": model or "claude-3-sonnet-20240229",
            "local": model or "llava"
        }
        
        # Initialize the API client
        self._initialize_client()
        
    def _initialize_client(self):
        """Initialize the appropriate API client"""
        if self.api_provider == "openai":
            if not OPENAI_AVAILABLE:
                raise ImportError("OpenAI package not available. Run: pip install openai")
            if self.api_key:
                openai.api_key = self.api_key
            self.client = openai.OpenAI(api_key=self.api_key)
            
        elif self.api_provider == "anthropic":
            if not ANTHROPIC_AVAILABLE:
                raise ImportError("Anthropic package not available. Run: pip install anthropic")
            self.client = anthropic.Anthropic(api_key=self.api_key)
            
        elif self.api_provider == "local":
            print("⚠️  Local LLM support - ensure your local service is running")
            self.client = None
        else:
            raise ValueError(f"Unsupported API provider: {self.api_provider}")
    
    def encode_image(self, image_path: str) -> str:
        """Encode image to base64 for API transmission"""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    
    def create_risk_table_prompt(self) -> str:
        """Create the detailed prompt for risk table analysis"""
        prompt = """
You are an expert medical data scientist analyzing Kaplan-Meier survival plots with "Number at Risk" tables.

Please analyze this image and extract the risk table data in JSON format.

TASK: Extract the "Number at Risk" table that typically appears below KM survival curves.

REQUIRED ANALYSIS:
1. **Time Points**: Identify all time points (X-axis values) where risk numbers are reported
2. **Group Names**: Identify all treatment/group names in the risk table
3. **Risk Numbers**: Extract the exact "number at risk" values for each group at each time point
4. **Table Structure**: Understand the layout and organization of the risk table

OUTPUT FORMAT (JSON):
```json
{
    "risk_table_detected": true,
    "table_type": "number_at_risk",
    "time_points": [0, 6, 12, 18, 24, 30, 36],
    "groups": [
        {
            "name": "Treatment Group A",
            "color_reference": "blue",
            "risk_data": {
                "0": 150,
                "6": 147,
                "12": 142,
                "18": 135,
                "24": 128,
                "30": 120,
                "36": 112
            }
        },
        {
            "name": "Control Group",
            "color_reference": "gray", 
            "risk_data": {
                "0": 148,
                "6": 140,
                "12": 130,
                "18": 118,
                "24": 105,
                "30": 92,
                "36": 78
            }
        }
    ],
    "units": "months",
    "additional_info": {
        "total_patients": 298,
        "table_position": "below_plot",
        "notes": "Standard number at risk table"
    }
}
```

EXTRACTION GUIDELINES:

**Time Points Detection:**
- Look for regular intervals (e.g., 0, 6, 12, 18, 24 months)
- Time points are usually aligned with the X-axis of the survival curve
- Common intervals: monthly, quarterly, yearly

**Group Identification:**
- Match group names with the legend of the survival curves
- Look for treatment names like "Drug A", "Placebo", "Control", "Treatment"
- Groups may be color-coded to match the survival curves

**Number Extraction:**
- Extract exact numerical values from the table
- Numbers typically decrease over time (patients dropping out)
- Be precise with digit recognition - medical data requires accuracy

**Data Validation:**
- Initial numbers (time 0) should be highest
- Numbers should generally decrease or stay same over time
- Total initial patients should match sum of all groups at time 0

**Common Risk Table Formats:**
- Tabular format below the plot
- Groups as rows, time points as columns
- Sometimes rotated: time points as rows, groups as columns
- May include additional statistics (events, censored, etc.)

**Quality Checks:**
- Verify numbers make biological sense
- Check for OCR errors (8 vs 3, 6 vs 5, etc.)
- Ensure consistency across time points
- Flag suspicious patterns

If no risk table is found, return:
```json
{
    "risk_table_detected": false,
    "reason": "No risk table found in image"
}
```

Be extremely precise with number recognition as this data will be used for medical analysis.
"""
        return prompt
    
    def analyze_with_openai(self, image_path: str) -> Dict:
        """Analyze risk table using OpenAI GPT-4 Vision"""
        base64_image = self.encode_image(image_path)
        
        response = self.client.chat.completions.create(
            model=self.models["openai"],
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text", 
                            "text": self.create_risk_table_prompt()
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=2000,
            temperature=0.1  # Low temperature for consistent number extraction
        )
        
        return response.choices[0].message.content
    
    def analyze_with_anthropic(self, image_path: str) -> Dict:
        """Analyze risk table using Anthropic Claude Vision"""
        base64_image = self.encode_image(image_path)
        
        message = self.client.messages.create(
            model=self.models["anthropic"],
            max_tokens=2000,
            temperature=0.1,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": base64_image
                            }
                        },
                        {
                            "type": "text",
                            "text": self.create_risk_table_prompt()
                        }
                    ]
                }
            ]
        )
        
        return message.content[0].text
    
    def parse_risk_table_response(self, response_text: str) -> Dict:
        """Parse and validate LLM response for risk table data"""
        print("🧠 Parsing risk table response...")
        
        # Extract JSON from response
        json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Try to find JSON without markdown
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
            else:
                raise ValueError("No valid JSON found in risk table response")
        
        try:
            parsed_data = json.loads(json_str)
            print("   ✅ Risk table JSON parsed successfully")
        except json.JSONDecodeError as e:
            print(f"   ❌ JSON parsing error: {e}")
            print(f"   Raw response: {response_text[:200]}...")
            raise
        
        return parsed_data
    
    def validate_risk_table_data(self, data: Dict) -> Dict:
        """Validate and clean the extracted risk table data"""
        print("🔍 Validating risk table data...")
        
        if not data.get("risk_table_detected", False):
            print("   ⚠️  No risk table detected in image")
            return data
        
        # Validate required fields
        required_fields = ["time_points", "groups"]
        for field in required_fields:
            if field not in data:
                print(f"   ❌ Missing required field: {field}")
                return {"risk_table_detected": False, "reason": f"Missing {field}"}
        
        # Validate time points
        time_points = data["time_points"]
        if not isinstance(time_points, list) or len(time_points) == 0:
            print("   ❌ Invalid time points")
            return {"risk_table_detected": False, "reason": "Invalid time points"}
        
        # Validate groups and risk data
        groups = data["groups"]
        if not isinstance(groups, list) or len(groups) == 0:
            print("   ❌ No groups found")
            return {"risk_table_detected": False, "reason": "No groups found"}
        
        validated_groups = []
        for group in groups:
            if "name" not in group or "risk_data" not in group:
                print(f"   ⚠️  Skipping incomplete group: {group}")
                continue
            
            # Validate risk data
            risk_data = group["risk_data"]
            validated_risk_data = {}
            
            for time_str, risk_count in risk_data.items():
                try:
                    time_val = float(time_str)
                    risk_val = int(risk_count)
                    validated_risk_data[time_str] = risk_val
                except (ValueError, TypeError):
                    print(f"   ⚠️  Invalid risk data: {time_str}={risk_count}")
                    continue
            
            if validated_risk_data:
                group["risk_data"] = validated_risk_data
                validated_groups.append(group)
                print(f"   ✅ Validated group: {group['name']} ({len(validated_risk_data)} time points)")
        
        data["groups"] = validated_groups
        
        if len(validated_groups) == 0:
            print("   ❌ No valid groups after validation")
            return {"risk_table_detected": False, "reason": "No valid groups"}
        
        print(f"   ✅ Risk table validation complete: {len(validated_groups)} groups, {len(time_points)} time points")
        return data
    
    def extract_risk_table(self, image_path: str, save_result: bool = True) -> Dict:
        """
        Main method to extract risk table from an image
        
        Args:
            image_path: Path to the image file (can be KM plot or separate risk table)
            save_result: Whether to save the analysis result
            
        Returns:
            Dictionary with extracted risk table data
        """
        print(f"📊 Extracting risk table from: {image_path}")
        print(f"🤖 Using {self.api_provider.upper()} API")
        
        # Verify image exists
        if not Path(image_path).exists():
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        # Analyze with appropriate provider
        try:
            if self.api_provider == "openai":
                response = self.analyze_with_openai(image_path)
            elif self.api_provider == "anthropic":
                response = self.analyze_with_anthropic(image_path)
            elif self.api_provider == "local":
                print("🔧 Local LLM analysis not implemented yet")
                return {"risk_table_detected": False, "reason": "Local LLM not implemented"}
            else:
                raise ValueError(f"Unknown provider: {self.api_provider}")
                
            print("   ✅ LLM risk table analysis complete")
            
        except Exception as e:
            print(f"   ❌ LLM analysis failed: {e}")
            raise
        
        # Parse and validate response
        parsed_data = self.parse_risk_table_response(response)
        cleaned_data = self.validate_risk_table_data(parsed_data)
        
        # Save result if requested
        if save_result and cleaned_data.get("risk_table_detected", False):
            output_file = Path(image_path).stem + "_risk_table.json"
            with open(output_file, 'w') as f:
                json.dump(cleaned_data, f, indent=2)
            print(f"   💾 Risk table data saved to: {output_file}")
        
        return cleaned_data
    
    def convert_to_dataframe(self, risk_data: Dict, endpoint: str = None) -> pd.DataFrame:
        """Convert risk table data to pandas DataFrame with standardized format"""
        if not risk_data.get("risk_table_detected", False):
            return pd.DataFrame()
        
        # Create list to store all rows
        rows = []
        time_points = sorted([float(t) for t in risk_data["time_points"]])
        
        for group in risk_data["groups"]:
            group_name = group["name"]
            risk_values = group["risk_data"]
            
            # Add a row for each time point
            for time_point in time_points:
                time_str = str(int(time_point)) if time_point.is_integer() else str(time_point)
                risk_count = risk_values.get(time_str, np.nan)
                
                # Skip rows with missing data
                if not pd.isna(risk_count):
                    rows.append({
                        'endpoint': endpoint if endpoint else 'Unknown',
                        'arm': group_name,
                        'time_months': time_point,
                        'n_risk': int(risk_count) if not pd.isna(risk_count) else None
                    })
        
        # Create DataFrame with standardized format: endpoint,arm,time_months,n_risk
        df = pd.DataFrame(rows)
        
        return df
    
    def print_risk_table_summary(self, risk_data: Dict):
        """Print a formatted summary of the risk table analysis"""
        print("\n" + "="*60)
        print("📊 RISK TABLE EXTRACTION SUMMARY")
        print("="*60)
        
        if not risk_data.get("risk_table_detected", False):
            print("❌ No risk table detected")
            print(f"   Reason: {risk_data.get('reason', 'Unknown')}")
            print("="*60)
            return
        
        # Table info
        table_type = risk_data.get("table_type", "unknown")
        print(f"📋 Table Type: {table_type}")
        
        # Time points
        time_points = risk_data.get("time_points", [])
        units = risk_data.get("units", "unknown")
        print(f"⏰ Time Points: {len(time_points)} points ({units})")
        print(f"   Range: {min(time_points)} to {max(time_points)} {units}")
        
        # Groups
        groups = risk_data.get("groups", [])
        print(f"\n👥 Groups ({len(groups)}):")
        
        total_initial = 0
        for i, group in enumerate(groups, 1):
            name = group.get("name", f"Group {i}")
            risk_values = group.get("risk_data", {})
            
            # Get initial and final counts
            if risk_values:
                times_sorted = sorted([float(t) for t in risk_values.keys()])
                initial_time = str(int(times_sorted[0]) if times_sorted[0].is_integer() else times_sorted[0])
                final_time = str(int(times_sorted[-1]) if times_sorted[-1].is_integer() else times_sorted[-1])
                
                initial_count = risk_values.get(initial_time, 0)
                final_count = risk_values.get(final_time, 0)
                total_initial += initial_count
                
                print(f"   {i}. {name}")
                print(f"      Initial: {initial_count} patients")
                print(f"      Final: {final_count} patients")
                print(f"      Retention: {(final_count/initial_count*100):.1f}%")
        
        print(f"\n📈 Study Summary:")
        print(f"   Total patients: {total_initial}")
        print(f"   Follow-up duration: {max(time_points)} {units}")
        print(f"   Risk assessments: {len(time_points)} time points")
        
        print("="*60)


def main():
    """Command line interface for the risk table extractor"""
    parser = argparse.ArgumentParser(description='AI-powered KM risk table extractor')
    parser.add_argument('image_path', help='Path to the image with risk table')
    parser.add_argument('--provider', choices=['openai', 'anthropic', 'local'], 
                       default='openai', help='LLM provider (default: openai)')
    parser.add_argument('--api-key', help='API key for the provider')
    parser.add_argument('--model', help='Model name (optional)')
    parser.add_argument('--no-save', action='store_true', help='Skip saving analysis')
    parser.add_argument('--export-csv', action='store_true', help='Export risk table as CSV')
    
    args = parser.parse_args()
    
    try:
        # Initialize extractor
        extractor = KMRiskTableExtractor(
            api_provider=args.provider,
            api_key=args.api_key,
            model=args.model
        )
        
        # Extract risk table
        risk_data = extractor.extract_risk_table(
            args.image_path, 
            save_result=not args.no_save
        )
        
        # Print summary
        extractor.print_risk_table_summary(risk_data)
        
        # Export CSV if requested
        if args.export_csv and risk_data.get("risk_table_detected", False):
            df = extractor.convert_to_dataframe(risk_data)
            csv_file = Path(args.image_path).stem + "_risk_table.csv"
            df.to_csv(csv_file)
            print(f"\n💾 Risk table exported to: {csv_file}")
        
    except Exception as e:
        print(f"❌ Risk table extraction failed: {e}")
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
