"""
Check sample size of pseudo-IPD data
"""
import pandas as pd

# Load data
pembro_data = pd.read_parquet('../PseuodoIPD/ipd_EndpointType.OS_Pembrolizumab.parquet')
chemo_data = pd.read_parquet('../PseuodoIPD/ipd_EndpointType.OS_Chemotherapy.parquet')

print("=" * 80)
print("PSEUDO-IPD SAMPLE SIZE CHECK")
print("=" * 80)

print("\nPembrolizumab Arm:")
print(f"  N = {len(pembro_data)}")
print(f"  Events = {pembro_data['event'].sum()}")
print(f"  Censored = {(1 - pembro_data['event']).sum()}")
print(f"  Event rate = {pembro_data['event'].mean():.1%}")

print("\nChemotherapy Arm:")
print(f"  N = {len(chemo_data)}")
print(f"  Events = {chemo_data['event'].sum()}")
print(f"  Censored = {(1 - chemo_data['event']).sum()}")
print(f"  Event rate = {chemo_data['event'].mean():.1%}")

print("\nTotal:")
print(f"  N = {len(pembro_data) + len(chemo_data)}")
print(f"  Events = {pembro_data['event'].sum() + chemo_data['event'].sum()}")

print("\n" + "=" * 80)
print("KEYNOTE-024 ACTUAL TRIAL (for comparison)")
print("=" * 80)
print("\nPublished trial data:")
print("  Pembrolizumab: N = 154")
print("  Chemotherapy: N = 151")
print("  Total: N = 305")

print("\n" + "=" * 80)
print("COMPARISON")
print("=" * 80)

total_pseudo = len(pembro_data) + len(chemo_data)
total_actual = 305
difference = total_actual - total_pseudo

print(f"\nYour pseudo-IPD: N = {total_pseudo}")
print(f"Actual trial: N = {total_actual}")
print(f"Difference: {difference} patients ({difference/total_actual*100:.1f}%)")

if abs(difference) > 10:
    print("\n⚠️  WARNING: Sample size difference is significant!")
    print("   This explains the ~100 point AIC/BIC difference.")
    print(f"   log({total_actual}) - log({total_pseudo}) = {np.log(total_actual) - np.log(total_pseudo):.3f}")
else:
    print("\n✅ Sample sizes are very close.")
    print("   AIC/BIC difference must be from other factors.")

import numpy as np
