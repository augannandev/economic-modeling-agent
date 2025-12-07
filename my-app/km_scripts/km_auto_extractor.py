#!/usr/bin/env python3
"""
Fully Automated KM Curve Extractor
Combines LLM image analysis with curve extraction for complete automation
"""

import os
import json
import argparse
import pandas as pd
from pathlib import Path
from km_llm_analyzer import KMPlotAnalyzer
from km_curve_extractor import KMCurveExtractor
from km_risk_table_extractor import KMRiskTableExtractor

class AutomatedKMExtractor:
    """
    Fully automated KM curve extraction using AI image analysis
    """
    
    def __init__(self, llm_provider="openai", api_key=None, model=None):
        """
        Initialize the automated extractor
        
        Args:
            llm_provider: "openai", "anthropic", or "local"
            api_key: API key for LLM provider
            model: Model name (optional)
        """
        self.llm_provider = llm_provider
        self.api_key = api_key
        self.model = model
        
        # Initialize LLM analyzer
        self.analyzer = KMPlotAnalyzer(
            api_provider=llm_provider,
            api_key=api_key,
            model=model
        )
        
        # Initialize risk table extractor
        self.risk_extractor = KMRiskTableExtractor(
            api_provider=llm_provider,
            api_key=api_key,
            model=model
        )
        
        self.analysis_result = None
        self.extraction_result = None
        self.risk_table_result = None
    
    def analyze_and_extract(self, image_path: str, save_analysis=True, save_extraction=True, granularity=None, 
                           extract_risk_table=True, risk_table_image=None, plot_without_risk_table=None, study_id=None):
        """
        Complete workflow: analyze image with LLM, then extract curves
        
        Args:
            image_path: Path to KM plot image (can be with or without risk table)
            save_analysis: Save LLM analysis to JSON
            save_extraction: Save extracted curves to CSV
            granularity: X-axis granularity for output resampling
            extract_risk_table: Whether to extract risk table data
            risk_table_image: Image WITH risk table for number extraction
            plot_without_risk_table: Clean plot WITHOUT risk table for curve extraction
            study_id: Optional study identifier to include in analysis
            
        Returns:
            Tuple of (analysis_result, extraction_result, risk_table_result)
            
        Recommended workflow:
            - Use plot_without_risk_table for cleaner curve extraction
            - Use risk_table_image (or image_path) for risk table extraction
            - This provides optimal accuracy for both tasks
        """
        print("🤖 AUTOMATED KM CURVE EXTRACTION")
        print("="*50)
        
        # Determine which image to use for analysis and curve extraction
        analysis_image = plot_without_risk_table or image_path
        curve_extraction_image = plot_without_risk_table or image_path
        risk_extraction_image = risk_table_image or image_path
        
        if plot_without_risk_table:
            print(f"📊 Using clean plot for analysis/curves: {plot_without_risk_table}")
        if risk_table_image:
            print(f"📋 Using separate image for risk table: {risk_table_image}")
        elif extract_risk_table:
            print(f"📋 Using main image for risk table: {image_path}")

        # Step 1: LLM Analysis
        print("\n🔍 STEP 1: AI Image Analysis")
        print("-" * 30)
        
        try:
            self.analysis_result = self.analyzer.analyze_image(
                analysis_image, 
                save_result=save_analysis,
                study_id=study_id
            )
            self.analyzer.print_analysis_summary(self.analysis_result)
            
        except Exception as e:
            print(f"❌ LLM analysis failed: {e}")
            raise
        
        # Step 2: Parameter Extraction
        print("\n⚙️  STEP 2: Parameter Extraction")
        print("-" * 30)
        
        try:
            # Extract parameters from analysis
            params = self._extract_parameters()
            # Update image path to use clean plot for curve extraction
            params['image_path'] = curve_extraction_image
            self._print_extraction_parameters(params)
            
        except Exception as e:
            print(f"❌ Parameter extraction failed: {e}")
            raise
        
        # Step 3: Curve Extraction
        print("\n🎯 STEP 3: Curve Extraction")
        print("-" * 30)
        
        try:
            # Add granularity if specified
            if granularity is not None:
                params['output_granularity'] = granularity
                print(f"   📊 Granularity: {granularity}")
            
            # Initialize curve extractor with AI-detected parameters
            extractor = KMCurveExtractor(**params)
            
            # Run the extraction pipeline
            original_curves, monotonic_curves = extractor.run_full_pipeline(
                save_plots=True,
                save_data=save_extraction
            )
            
            self.extraction_result = {
                'original_curves': original_curves,
                'monotonic_curves': monotonic_curves,
                'parameters': params
            }
            
        except Exception as e:
            print(f"❌ Curve extraction failed: {e}")
            raise
        
        # Step 4: Risk Table Extraction (Optional)
        if extract_risk_table:
            print("\n📊 STEP 4: Risk Table Extraction")
            print("-" * 30)
            
            try:
                print(f"   📋 Analyzing risk table from: {risk_extraction_image}")
                
                self.risk_table_result = self.risk_extractor.extract_risk_table(
                    risk_extraction_image, 
                    save_result=save_analysis
                )
                
                if self.risk_table_result.get("risk_table_detected", False):
                    self.risk_extractor.print_risk_table_summary(self.risk_table_result)
                else:
                    print("   ⚠️  No risk table detected - continuing without risk data")
                
            except Exception as e:
                print(f"   ⚠️  Risk table extraction failed: {e}")
                print("   ℹ️  Continuing with curve extraction only")
                self.risk_table_result = {"risk_table_detected": False, "reason": str(e)}
        else:
            print("\n⏭️  Skipping risk table extraction")
            self.risk_table_result = {"risk_table_detected": False, "reason": "Skipped by user"}

        # Step 5: Final Summary
        print("\n📊 FINAL SUMMARY")
        print("="*50)
        self._print_final_summary()
        
        return self.analysis_result, self.extraction_result, self.risk_table_result
    
    def _extract_parameters(self):
        """Extract parameters for KMCurveExtractor from LLM analysis"""
        if not self.analysis_result:
            raise ValueError("No analysis result available")
        
        # Extract curve colors and names
        colors = []
        curve_names = []
        if "curves" in self.analysis_result:
            for curve in self.analysis_result["curves"]:
                colors.append(curve.get("color", "blue"))
                curve_names.append(curve.get("name", f"curve_{len(curve_names)+1}"))
        
        if not colors:
            colors = ["blue", "gray"]  # Default fallback
            curve_names = ["curve_1", "curve_2"]
            print("   ⚠️  No colors detected, using default: blue, gray")
        
        # Extract outcome type
        outcome_type = self.analysis_result.get("outcome_type", "survival")
        if outcome_type:
            print(f"   📊 Detected outcome type: {outcome_type}")
        
        # Extract axis ranges
        ranges = self.analysis_result.get("axis_ranges", {})
        x_min = float(ranges.get("x_min", 0))
        x_max = float(ranges.get("x_max", 80))
        y_min = float(ranges.get("y_min", 0))
        y_max = float(ranges.get("y_max", 100))
        
        # Extract grid intervals
        intervals = self.analysis_result.get("grid_intervals", {})
        x_interval = float(intervals.get("x_interval", 10))
        y_interval = float(intervals.get("y_interval", 20))
        
        # Get image path
        image_path = getattr(self, '_current_image_path', 'unknown')
        
        return {
            'image_path': image_path,
            'colors': colors,
            'x_min': x_min,
            'x_max': x_max, 
            'y_min': y_min,
            'y_max': y_max,
            'x_interval': x_interval,
            'y_interval': y_interval,
            'curve_names': curve_names,
            'outcome_type': outcome_type
        }
    
    def _print_extraction_parameters(self, params):
        """Print the parameters that will be used for extraction"""
        print("🔧 Extraction Parameters:")
        print(f"   📁 Image: {params['image_path']}")
        print(f"   🎨 Colors: {', '.join(params['colors'])}")
        print(f"   🏷️  Curve names: {', '.join(params['curve_names'])}")
        print(f"   📊 Outcome type: {params['outcome_type']}")
        print(f"   📏 X range: {params['x_min']} to {params['x_max']}")
        print(f"   📏 Y range: {params['y_min']} to {params['y_max']}")
        print(f"   📊 Grid: X={params['x_interval']}, Y={params['y_interval']}")
    
    def _print_final_summary(self):
        """Print comprehensive final summary"""
        if not self.analysis_result or not self.extraction_result:
            print("❌ Incomplete results")
            return
        
        # Analysis summary
        curves_detected = len(self.analysis_result.get("curves", []))
        print(f"🧠 LLM Analysis: {curves_detected} curves detected")
        
        # Extraction summary
        original = self.extraction_result['original_curves']
        monotonic = self.extraction_result['monotonic_curves']
        
        print(f"🎯 Curve Extraction Results:")
        for curve_name in original.keys():
            orig_count = len(original[curve_name]) if curve_name in original else 0
            mono_count = len(monotonic[curve_name]) if curve_name in monotonic else 0
            print(f"   {curve_name}: {orig_count} → {mono_count} points (after filtering)")
        
        # Success metrics
        successful_curves = sum(1 for df in monotonic.values() if len(df) > 0)
        print(f"✅ Successfully extracted: {successful_curves}/{len(monotonic)} curves")
        
        # File outputs
        print(f"\n📁 Generated Files:")
        print(f"   📊 Plots: km_extraction_pipeline.png, km_curve_*.png")
        print(f"   📋 Data: output/original_*_curve.csv, output/monotonic_*_curve.csv")
        print(f"   🧠 Analysis: *_analysis.json")
    
    def save_complete_results(self, output_dir="automated_results"):
        """Save all results in organized format"""
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)
        
        print(f"\n💾 Saving complete results to {output_dir}/")
        
        # Save analysis
        if self.analysis_result:
            analysis_file = output_path / "llm_analysis.json"
            with open(analysis_file, 'w') as f:
                json.dump(self.analysis_result, f, indent=2)
            print(f"   🧠 LLM analysis: {analysis_file}")
        
        # Save extraction parameters
        if self.extraction_result:
            params_file = output_path / "extraction_parameters.json"
            with open(params_file, 'w') as f:
                json.dump(self.extraction_result['parameters'], f, indent=2)
            print(f"   ⚙️  Parameters: {params_file}")
        
        # Save curve data in standardized format
        if self.extraction_result and 'monotonic_curves' in self.extraction_result:
            # Get endpoint from analysis result
            endpoint = 'Unknown'
            if self.analysis_result and 'outcome_type' in self.analysis_result:
                endpoint = self.analysis_result['outcome_type'].upper()
            
            for curve_name, df in self.extraction_result['monotonic_curves'].items():
                if len(df) > 0:
                    # Convert to standardized format: endpoint,arm,time_months,survival
                    standardized_df = pd.DataFrame({
                        'endpoint': endpoint,
                        'arm': curve_name,
                        'time_months': df['X'],
                        'survival': df['Y'] / 100.0  # Scale from 0-100% to 0-1
                    })
                    
                    curve_file = output_path / f"final_{curve_name}_curve.csv"
                    standardized_df.to_csv(curve_file, index=False)
                    print(f"   📊 {curve_name} curve: {curve_file} (standardized format: endpoint,arm,time_months,survival)")
        
        # Save risk table data separately
        if self.risk_table_result and self.risk_table_result.get("risk_table_detected", False):
            risk_file = output_path / "risk_table.json"
            with open(risk_file, 'w') as f:
                json.dump(self.risk_table_result, f, indent=2)
            print(f"   📋 Risk table data: {risk_file}")
            
            # Also save as CSV with standardized format
            # Get endpoint from analysis result
            endpoint = 'Unknown'
            if self.analysis_result and 'outcome_type' in self.analysis_result:
                endpoint = self.analysis_result['outcome_type'].upper()
            
            risk_df = self.risk_extractor.convert_to_dataframe(self.risk_table_result, endpoint=endpoint)
            if not risk_df.empty:
                risk_csv_file = output_path / "risk_table.csv"
                risk_df.to_csv(risk_csv_file, index=False)
                print(f"   📋 Risk table CSV: {risk_csv_file} (standardized format: endpoint,arm,time_months,n_risk)")
        
        # Create summary report
        summary_file = output_path / "extraction_report.txt"
        with open(summary_file, 'w') as f:
            f.write("AUTOMATED KM CURVE EXTRACTION REPORT\n")
            f.write("="*50 + "\n\n")
            
            if self.analysis_result:
                f.write("LLM ANALYSIS RESULTS:\n")
                f.write(f"Plot type: {self.analysis_result.get('plot_type', 'Unknown')}\n")
                f.write(f"Curves detected: {len(self.analysis_result.get('curves', []))}\n")
                
                for curve in self.analysis_result.get('curves', []):
                    f.write(f"  - {curve.get('name', 'Unknown')}: {curve.get('color', 'Unknown')} color\n")
                
                ranges = self.analysis_result.get('axis_ranges', {})
                f.write(f"X range: {ranges.get('x_min')} to {ranges.get('x_max')}\n")
                f.write(f"Y range: {ranges.get('y_min')} to {ranges.get('y_max')}\n\n")
            
            if self.extraction_result:
                f.write("CURVE EXTRACTION RESULTS:\n")
                mono = self.extraction_result['monotonic_curves']
                for curve_name, df in mono.items():
                    f.write(f"{curve_name}: {len(df)} points extracted\n")
                    if len(df) > 1:
                        f.write(f"  Range: X({df['X'].min():.2f}-{df['X'].max():.2f}), ")
                        f.write(f"Y({df['Y'].min():.2f}-{df['Y'].max():.2f})\n")
        
        print(f"   📋 Summary report: {summary_file}")
        
        return output_path
    
    def _merge_curve_and_risk_data(self, curve_df, curve_name):
        """
        Merge curve data with risk table data if available
        
        Args:
            curve_df: DataFrame with curve X,Y data
            curve_name: Name of the curve to match with risk table
            
        Returns:
            Enhanced DataFrame with risk data columns
        """
        if not self.risk_table_result or not self.risk_table_result.get("risk_table_detected", False):
            return curve_df
        
        import pandas as pd
        import numpy as np
        
        # Convert risk table to DataFrame
        risk_df = self.risk_extractor.convert_to_dataframe(self.risk_table_result)
        if risk_df.empty:
            return curve_df
        
        # Find matching risk table column for this curve
        risk_column = None
        groups = self.risk_table_result.get("groups", [])
        
        for group in groups:
            group_name = group.get("name", "")
            # Try to match curve name with risk table group name
            if (curve_name.lower() in group_name.lower() or 
                group_name.lower() in curve_name.lower() or
                any(word in group_name.lower() for word in curve_name.lower().split())):
                risk_column = f"{group_name}_at_risk"
                break
        
        if risk_column and risk_column in risk_df.columns:
            print(f"   🔗 Merging risk data for {curve_name} with {risk_column}")
            
            # Create enhanced DataFrame
            enhanced_df = curve_df.copy()
            enhanced_df['Number_at_Risk'] = np.nan
            
            # Match risk data with curve data based on X values (time points)
            for risk_time, risk_count in risk_df[risk_column].items():
                if pd.notna(risk_count):
                    # Find closest X values in curve data
                    time_diffs = np.abs(enhanced_df['X'] - risk_time)
                    closest_indices = time_diffs <= 0.5  # Within 0.5 time units
                    
                    if closest_indices.any():
                        enhanced_df.loc[closest_indices, 'Number_at_Risk'] = int(risk_count)
            
            # Forward fill risk values for intermediate points
            enhanced_df['Number_at_Risk'] = enhanced_df['Number_at_Risk'].ffill()
            
            return enhanced_df
        else:
            print(f"   ⚠️  No matching risk data found for {curve_name}")
            return curve_df


def main():
    """Command line interface for automated extraction"""
    parser = argparse.ArgumentParser(description='Fully automated KM curve extraction')
    parser.add_argument('image_path', help='Path to the KM plot image')
    parser.add_argument('--llm-provider', choices=['openai', 'anthropic', 'local'], 
                       default='openai', help='LLM provider (default: openai)')
    parser.add_argument('--api-key', help='API key for LLM provider')
    parser.add_argument('--model', help='LLM model name (optional)')
    parser.add_argument('--output-dir', default='automated_results', 
                       help='Output directory (default: automated_results)')
    parser.add_argument('--granularity', type=float,
                       help='X-axis granularity for output (e.g., 0.1, 0.5, 1.0)')
    parser.add_argument('--no-save-analysis', action='store_true', 
                       help='Skip saving LLM analysis')
    parser.add_argument('--no-save-extraction', action='store_true', 
                       help='Skip saving extraction results')
    parser.add_argument('--no-risk-table', action='store_true',
                       help='Skip risk table extraction')
    parser.add_argument('--risk-table-image', 
                       help='Image WITH risk table for number extraction')
    parser.add_argument('--plot-without-risk-table',
                       help='Clean plot WITHOUT risk table for optimal curve extraction')
    parser.add_argument('--study-id', 
                       help='Study identifier to include in analysis metadata')
    
    args = parser.parse_args()
    
    try:
        # Initialize automated extractor
        extractor = AutomatedKMExtractor(
            llm_provider=args.llm_provider,
            api_key=args.api_key,
            model=args.model
        )
        
        # Store image path for reference
        extractor._current_image_path = args.image_path
        
        # Run complete workflow
        analysis, extraction, risk_table = extractor.analyze_and_extract(
            args.image_path,
            save_analysis=not args.no_save_analysis,
            save_extraction=not args.no_save_extraction,
            granularity=args.granularity,
            extract_risk_table=not args.no_risk_table,
            risk_table_image=args.risk_table_image,
            plot_without_risk_table=args.plot_without_risk_table,
            study_id=args.study_id
        )
        
        # Save organized results
        extractor.save_complete_results(args.output_dir)
        
        print(f"\n🎉 AUTOMATION COMPLETE!")
        print(f"📁 All results saved to: {args.output_dir}/")
        
        return 0
        
    except Exception as e:
        print(f"\n❌ AUTOMATION FAILED: {e}")
        return 1


if __name__ == "__main__":
    exit(main())
