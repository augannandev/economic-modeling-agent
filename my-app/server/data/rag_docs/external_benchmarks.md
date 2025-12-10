# External Survival Benchmarks for Long-Term Extrapolation Validation
**Version:** 1.1 (Final)
**Purpose:**
Provide independent real-world survival benchmarks for Stage IV NSCLC to evaluate the **clinical plausibility** of long-term extrapolated OS/PFS curves.
These benchmarks are **not from the trial** and serve as **external anchors** for tail validity, HTA justification, sensitivity analyses, and model rejection.

---

# 1. Chemotherapy Era Benchmarks (No Immunotherapy)

## 1.1 SEER (US National Registry)
**Source:** Surveillance, Epidemiology, and End Results Program
**Population:** Stage IV NSCLC, 2010–2014 (Pre-IO era strict cut-off)
**Characteristics:** Unselected, real-world, mixed ECOG 0–4.

### Survival Rates
| Timepoint | OS (Historical Floor) |
|----------|-----|
| **1 year** | **31.3%** |
| **2 years** | **16.6%** |
| **5 years** | **4.2% – 5.8%** |
| **10 years** | **< 2%** |

**Interpretation:**
SEER provides the **minimum baseline**.
**5-year OS ≈ 4%** is the absolute **lower bound** for any realistic chemo arm. If a model drops below this, it predicts outcomes worse than the historical unselected population (implausible for a trial).

---

## 1.2 UK NLCA (National Lung Cancer Audit)
**Population:** Stage IV NSCLC, ECOG 0–1 Only.
**Interpretation:** Corrects SEER upward for Performance Status.
* **1-year OS:** ~45%
* **5-year OS:** ~5–6%

---

## 1.3 Modern Platinum-Doublet Trials (Control Arms)
**Source:** Control arms of KEYNOTE-189, KEYNOTE-407, CheckMate 9LA.
**Population:** "Olympic Athletes" (Selected ECOG 0-1, no comorbidities).

### Survival
* **Median OS:** 11–13 months
* **5-year OS:** **9–11%** (Best-case chemo without heavy crossover)

**Interpretation:**
Represents the "Optimized Baseline" for clinical trials.

---

# 2. Survival Plausibility Ranges – Chemotherapy Arm

These represent **acceptable**, **borderline**, and **implausible** long-term survival rates for the chemotherapy arm.

| 5-year OS | Interpretation |
|----------|----------------|
| **<4%** | ⚠ **Too pessimistic** (Below SEER floor) |
| **4–6%** | **Real-World Baseline** (SEER/Unselected) |
| **6–11%** | **Trial Standard** (ECOG 0–1, Optimized care) |
| **12–18%** | **Crossover Impacted** (Chemo → IO allowed) |
| **>20%** | ❌ **Implausible** — Reject model |

**Notes for HTA reproducibility:**
NICE TAA explicitly rejects models predicting **>15–20% 5-year OS** for pure chemotherapy, as this implies a "cure fraction" inconsistent with the mechanism of action.

---

# 3. PD-1 Inhibitor (Immunotherapy) Benchmarks

## 3.1 KEYNOTE-001 & KEYNOTE-024 (Long-term Follow-up)
**Source:** Garon et al., JCO 2019; Reck et al., JCO 2021.

### 5-year OS Benchmarks
| Subgroup | 5-year OS |
|----------|-----------|
| **Treatment-naïve (PD-L1 ≥50%)** | **31.9%** (KN-024) |
| **Treatment-naïve (All-comers)** | **23.2%** (KN-001) |
| **Previously treated (All-comers)** | **15.5%** |

**Interpretation:**
These values define the **target corridors** for immune-checkpoint inhibitor tail survival.

---

# 4. Survival Plausibility Ranges – Pembrolizumab (IO) Arm

| Timepoint | Expected Range | Interpretation |
|----------|----------------|----------------|
| **5 years** | **25–35%** | **Expected** (1L PD-L1 ≥50%) |
|            | **20–25%** | **Conservative** (All-comers or lower expression) |
|            | **<15%** | ⚠ **Pessimistic** (Worse than 2nd-line historical) |
|            | **>40%** | ❌ **Implausible** (Exceeds best observed trial data) |

| Timepoint | Expected |
|----------|----------|
| **10 years** | **10–15%** |

---

# 5. Population Adjustment Framework

| Factor | Expected Impact on OS |
|--------|------------------------|
| **ECOG 0–1 Selection** | Shifts 5y OS from **4% → ~10%** |
| **PD-L1 ≥50% Selection** | Shifts 5y OS from **~23% → ~32%** (for IO) |
| **Heavy Crossover (>50%)** | Shifts Chemo 5y OS from **10% → 15%+** |

---

# 6. Model Plausibility Decision Rules

## 6.1 Deviation Test
For any model prediction **M** and benchmark **B**:

$$
Deviation = \frac{M - B}{B} \times 100\%
$$

* **>100% Deviation:** Flag as "High Concern" (e.g., Model predicts 20% Chemo survival when Benchmark is 10%).

## 6.2 Hard-Fail Rules (Chemo Arm)
**Reject model if:**
1.  **S(5y) > 18%** (Unless >50% crossover explicitly modeled).
2.  **S(10y) > 6%**.
3.  **Hazard Function:** Decreases indefinitely toward 0 (Implies cure).
4.  **Shape:** Shows a definitive "plateau" above 5%.

## 6.3 Hard-Fail Rules (Pembrolizumab Arm)
**Reject model if:**
1.  **S(5y) < 15%** (Fails to beat historical 2nd-line).
2.  **S(5y) > 45%** (Biologically unrealistic for metastatic disease).

---

# 7. Machine-Readable External Benchmarks

```json
{
  "chemo_stageIV": {
    "5y": { "expected": 0.08, "range": [0.04, 0.12], "hard_max": 0.18 },
    "10y": { "expected": 0.02, "range": [0.01, 0.05] }
  },
  "pembro_1L_PDL1_50": {
    "5y": { "expected": 0.32, "range": [0.25, 0.38], "hard_max": 0.45 },
    "10y": { "expected": 0.14, "range": [0.10, 0.18] }
  }
}