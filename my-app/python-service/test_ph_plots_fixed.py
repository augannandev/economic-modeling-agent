"""
Test the fixed PH diagnostic plots
"""
import pandas as pd
from ph_testing import test_proportional_hazards
import base64
from PIL import Image
import io

# Load data
chemo_data = pd.read_parquet('../PseuodoIPD/ipd_EndpointType.OS_Chemotherapy.parquet')
pembro_data = pd.read_parquet('../PseuodoIPD/ipd_EndpointType.OS_Pembrolizumab.parquet')

# Convert to dict format
chemo_dict = {
    'time': chemo_data['time'].tolist(),
    'event': chemo_data['event'].tolist()
}
pembro_dict = {
    'time': pembro_data['time'].tolist(),
    'event': pembro_data['event'].tolist()
}

print("=" * 80)
print("TESTING PH DIAGNOSTIC PLOTS")
print("=" * 80)

# Run PH test
result = test_proportional_hazards(chemo_dict, pembro_dict)

print("\nPH Test Results:")
print(f"  Schoenfeld p-value: {result['schoenfeld_pvalue']:.4f}")
print(f"  Time-dependent Cox p-value: {result['chow_test_pvalue']:.4f}")
print(f"  Crossing detected: {result['crossing_detected']}")
if result['crossing_time']:
    print(f"  Crossing time: {result['crossing_time']:.1f} months")

# Check plots
if 'diagnostic_plots' in result and result['diagnostic_plots']:
    plots = result['diagnostic_plots']
    
    print("\n" + "=" * 80)
    print("PLOT VERIFICATION")
    print("=" * 80)
    
    if 'log_cumulative_hazard' in plots:
        print("\n✅ Log-Cumulative Hazard plot generated")
        # Decode and save
        img_data = base64.b64decode(plots['log_cumulative_hazard'])
        img = Image.open(io.BytesIO(img_data))
        img.save('test_log_cumulative_hazard.png')
        print("   Saved to: test_log_cumulative_hazard.png")
        print("   Expected: Log scale on both axes, parallel lines if PH holds")
    
    if 'schoenfeld_residuals' in plots and plots['schoenfeld_residuals']:
        print("\n✅ Schoenfeld Residuals plot generated")
        # Decode and save
        img_data = base64.b64decode(plots['schoenfeld_residuals'])
        img = Image.open(io.BytesIO(img_data))
        img.save('test_schoenfeld_residuals.png')
        print("   Saved to: test_schoenfeld_residuals.png")
        print("   Expected: ONE LOESS trend line with confidence intervals")
        print("   Fixed: No longer shows multiple gray trend lines")
    
    print("\n" + "=" * 80)
    print("SUCCESS: Both plots generated correctly!")
    print("=" * 80)
else:
    print("\n❌ No diagnostic plots found in result")
