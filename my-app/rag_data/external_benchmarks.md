# External Survival Benchmarks for Long-Term Extrapolation Validation
**Version:** 1.0  
**Purpose:**  
Provide independent real-world survival benchmarks for Stage IV NSCLC to evaluate the **clinical plausibility** of long-term extrapolated OS/PFS curves.  
These benchmarks are **not from the trial** and serve as **external anchors** for tail validity, HTA justification, sensitivity analyses, and model rejection.

---

# 1. Chemotherapy Era Benchmarks (No Immunotherapy)

## 1.1 SEER (US National Registry)

**Source:** Surveillance, Epidemiology, and End Results Program  
**Population:** Stage IV NSCLC, 2010–2015 (pre-IO era)  
**Characteristics:**  
- All ages  
- Mixed histology  
- Mixed performance status (ECOG 0–4)  
- Real-world treatment distribution  

### Survival Rates
| Timepoint | OS |
|----------|-----|
| **1 year** | **31.3%** |
| **2 years** | **16.6%** |
| **5 years** | **5.8%** |
| **10 years** | ~**2%** |

**Interpretation:**  
SEER provides a **minimum baseline** for chemotherapy-only advanced NSCLC.  
5-year OS ≈ 6% is a **lower bound** for any realistic chemo arm.

---

## 1.2 UK NLCA (National Lung Cancer Audit)

**Population:** Stage IV NSCLC  
**Stratification:** By ECOG performance status  

### ECOG 0–1 Survival
| Timepoint | OS |
|----------|-----|
| **1 year** | ~**45%** |
| **5 years** | ~**5%** |

**Interpretation:**  
More trial-like population; corrects SEER upward for ECOG selection.

---

## 1.3 Historical Platinum-Doublet Trials

**Source:** Pilkington et al., Thorax 2015 – Pooled RCTs (2000–2014)  
**Regimens:** Cisplatin/carboplatin doublets  

### Survival
- **Median OS:** 10–13 months  
- **1-year OS:** 40–50%  
- **2-year OS:** 15–25%  
- **5-year OS:** 5–8% (selected RCT populations)

**Interpretation:**  
Represents typical RCT survival for first-line chemotherapy in Stage IV NSCLC.

---

# 2. Survival Plausibility Ranges – Chemotherapy Arm

These represent **acceptable**, **borderline**, and **implausible** long-term survival rates for the chemotherapy arm.

| 5-year OS | Interpretation |
|----------|----------------|
| **<4%** | ⚠ Too pessimistic (below SEER) |
| **4–6%** | General population (SEER) |
| **6–10%** | Trial-like (ECOG 0–1) |
| **10–16%** | Chemo with **substantial crossover to IO** |
| **>20%** | ❌ Implausible — reject model |

**Notes for HTA reproducibility:**  
NICE TA447 explicitly rejected lognormal/gamma because they predicted **10–20%+ 5-year OS** for chemotherapy, which contradicted all known real-world benchmarks.

---

# 3. PD-1 Inhibitor (Immunotherapy) Benchmarks

## 3.1 KEYNOTE-001 (Pembrolizumab)

**Source:** Garon et al., JCO 2019  
**Population:** Treatment-naïve and previously treated NSCLC  
**PD-L1 stratified data**

### 5-year OS Rates
| Subgroup | 5-year OS |
|----------|-----------|
| **Treatment-naïve (all-comers)** | **23.2%** |
| **Treatment-naïve, PD-L1 ≥50%** | **29.6%** |
| **Previously treated (all-comers)** | **15.5%** |
| **Previously treated, PD-L1 ≥50%** | **25.0%** |

**Interpretation:**  
These values define the **lower and upper bounds** for immune-checkpoint inhibitor tail survival.

---

## 3.2 CheckMate (Nivolumab) – Second Line

### Results
- **5-year OS:** **13–16%**

**Interpretation:**  
Confirms PD-1 inhibitors generate durable long-term survival even after progression on chemo.

---

# 4. Survival Plausibility Ranges – Pembrolizumab Arm

| Timepoint | Expected Range | Interpretation |
|----------|----------------|----------------|
| **5 years** | **20–30%** | Expected range for 1L PD-L1 ≥50% |
|            | **15–20%** | Borderline low (worse than 2L) |
|            | **30–35%** | Upper plausible (requires justification) |
|            | **>40%** | ❌ Implausible – reject |

| Timepoint | Expected |
|----------|----------|
| **10 years** | **8–15%** |

---

# 5. Population Adjustment Framework

These modifiers help determine whether deviations from benchmark survival are justified.

| Factor | Expected Impact on OS |
|--------|------------------------|
| ECOG 0–1 vs mixed | +10–30% |
| Age <70 vs all ages | +5–15% |
| PD-L1 ≥50% vs unselected | +20–40% (for IO) |
| Treatment-naïve vs mixed | +10–20% |
| Crossover to immunotherapy | +50–150% for chemo-labeled arm |

**Example Adjustment:**  
SEER 5-year OS = **5.8%**  
Trial-selected (ECOG 0–1, younger) → **8–12%**  
With crossover → **12–16%** upper plausible bound.

---

# 6. Model Plausibility Decision Rules

## 6.1 Deviation Test  
For any model prediction **M** and benchmark **B**:

\[
Deviation = \frac{M - B}{B} \times 100\%
\]

| Deviation | Interpretation |
|----------|----------------|
| **<50%** | ✓ Plausible |
| **50–100%** | ⚠ Moderate concern |
| **100–200%** | 🚨 High concern |
| **>200%** | ❌ Implausible — reject |

---

## 6.2 Hard-Fail Rules (Chemo Arm)

Reject model if:

- **S(5y) > 20%**  
- **S(10y) > 5%**  
- Hazards **decrease indefinitely**  
- Curve shows **plateau/cure behavior** (not expected in metastatic NSCLC)  

---

## 6.3 Hard-Fail Rules (Pembrolizumab Arm)

Reject model if:

- **S(5y) < 15%** (worse than 2L PD-1 outcomes)  
- **S(5y) > 40%** (biologically implausible for metastatic NSCLC)  
- Curve suggests **growing survival plateau** inconsistent with known IO biology  

---

# 7. Machine-Readable External Benchmarks

```json
{
  "chemo_stageIV": {
    "5y": { "expected": 0.08, "range": [0.05, 0.12], "hard_max": 0.20 },
    "10y": { "expected": 0.02, "range": [0.01, 0.04] }
  },
  "pembro_1L_PDL1_50": {
    "5y": { "expected": 0.25, "range": [0.20, 0.35], "hard_max": 0.40 },
    "10y": { "expected": 0.10, "range": [0.08, 0.15] }
  }
}
