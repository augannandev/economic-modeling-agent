# Demo Data Information

## Location

Demo data is stored in: **`/my-app/python-service/demo_data/`**

## Available Files

- `ipd_EndpointType.OS_Chemotherapy.parquet`
- `ipd_EndpointType.OS_Pembrolizumab.parquet`
- `ipd_EndpointType.PFS_Chemotherapy.parquet`
- `ipd_EndpointType.PFS_Pembrolizumab.parquet`

## Data Format

The demo data files contain **Individual Patient Data (IPD)** with the following columns:
- `patient_id`: Unique patient identifier
- `time`: Survival time (in months)
- `event`: Event indicator (1 = event, 0 = censored)
- `arm`: Treatment arm name

**Example:**
```
   patient_id      time  event           arm
0          25  0.113076      0  Chemotherapy
1          24  0.733305      0  Chemotherapy
2          26  0.735899      0  Chemotherapy
3           2  1.250455      1  Chemotherapy
```

## How Demo Data is Used

1. **When no project is selected**: The system automatically loads demo data from `demo_data/` directory
2. **API Endpoint**: `/demo-data/{endpoint_type}` (e.g., `/demo-data/OS`)
3. **Data Source**: Python service loads parquet files from `demo_data/` folder

## IPD Reconstruction Plots in Synthesis Report

### Current Behavior

**IPD reconstruction plots are NOT currently generated when using demo data** because:

1. **Demo data is already IPD**: The files contain individual patient data, not KM curves that need reconstruction
2. **IPD plots are for validation**: The IPD reconstruction plots are designed to validate the accuracy of reconstructing IPD from KM curves (comparing original KM vs reconstructed KM)
3. **No reconstruction step**: Since demo data is already IPD, there's no reconstruction step to validate

### When IPD Plots ARE Generated

IPD reconstruction plots are generated when:
- Data comes from KM Digitizer (KM curves → IPD reconstruction)
- Data comes from Supabase projects that were created via KM Digitizer
- The system needs to validate that reconstructed IPD matches original KM curves

### To Add IPD Plots for Demo Data

If you want IPD validation plots in the synthesis report when using demo data, you would need to:

1. Generate KM curves from the demo IPD data
2. Use those KM curves to reconstruct IPD (via R service)
3. Compare original demo IPD with reconstructed IPD
4. Generate validation plots

This would be useful to show that:
- The demo IPD data produces reasonable KM curves
- The R service reconstruction is working correctly
- The data quality is validated

## Changing Demo Data

To update the demo data:

1. **Replace the parquet files** in `/my-app/python-service/demo_data/`
2. **Ensure format matches**: Files must have `time`, `event`, and `arm` columns
3. **File naming**: Must follow pattern `ipd_EndpointType.{ENDPOINT}_{ARM}.parquet`
   - Example: `ipd_EndpointType.OS_Chemotherapy.parquet`
4. **Restart Python service** if it's running (to ensure new files are loaded)

## Current Demo Data Source

Based on the file structure and validation scripts, the current demo data appears to be:
- **Source**: Reconstructed IPD from KEYNOTE-024 (using R service IPDfromKM)
- **Patients**: 151 Chemotherapy, 154 Pembrolizumab (for OS)
- **Validation**: HR = 0.6161 vs published 0.60 (2.7% difference, overlapping CIs)

