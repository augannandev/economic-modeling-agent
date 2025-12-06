# SurvAgent HTA Survival Modelling Style Guide (`synthesis_report_style.md`)

This document defines the writing style, tone, and conventions for all SurvLab+ survival analysis outputs, especially reports intended for HTA / regulatory audiences (e.g., NICE, CADTH, payers).

The goal is to **sound like a NICE technology appraisal technical section** (e.g., TA447) and **NICE DSU TSD documents**, while being clear, neutral, and reproducible.

The LLM MUST follow this guide whenever producing narrative text.

---

## 1. Audience and Purpose

- **Primary audience**
  - Health technology assessment (HTA) agencies (e.g., NICE).
  - Health economists and outcomes researchers.
  - Biostatisticians and clinical trialists.
  - Clinical experts (oncologists) reviewing modelling assumptions.

- **Purpose**
  - Describe survival analyses in a way that is:
    - **Methodologically rigorous**
    - **Transparent and reproducible**
    - **Aligned with NICE DSU guidance (TSD 14, 16, 21)**
    - **Directly usable as a technical appendix section in an HTA submission**

---

## 2. Voice, Tone, and Perspective

- **Voice:** Formal, neutral, and analytical.
- **Perspective:** Third person, impersonal. Avoid “I”, “we”, “our”. Use constructions like:
  - “The analysis used…”
  - “Models were fitted…”
  - “The proportional hazards assumption was assessed…”
- **Tone:**
  - Objective; avoid enthusiasm or hype.
  - Focus on **methods → diagnostics → justification → sensitivity**.
  - Avoid promotional language (no “ground-breaking”, “excellent”, “powerful”).

**Preferred examples**
- “The Weibull model provided an adequate representation of the observed data.”
- “The proportional hazards assumption was not supported, and independent models were therefore used.”

**Avoid**
- “We found that the Weibull model is the best and clearly superior.”
- “The results strongly prove that pembrolizumab is far better.”

---

## 3. Tense and Grammar

- Use **past tense** for actions already performed:
  - “The proportional hazards assumption was evaluated using Schoenfeld residuals.”
- Use **present tense** for stable definitions and general guidance:
  - “TSD 14 recommends that parametric models be assessed using AIC and BIC.”
- Avoid contractions:
  - Use “did not”, “was not” instead of “didn’t”, “wasn’t”.

---

## 4. Report Structure and Section Flow

Reports should follow a high-level logical flow:

1. **Overview of data and objectives**
2. **Proportional hazards assessment**
3. **Model candidates and fitting strategy**
4. **Evaluation of model fit and extrapolation**
5. **Rationale for selected base-case model**
6. **Sensitivity analyses**
7. **Summary and implications for cost-effectiveness**

Within each section:
- Start with **methods** (what was done).
- Then present **diagnostics/results** (what was found).
- Conclude with **interpretation/implication** (what it means for modelling).

---

## 5. Paragraph Construction Patterns

### 5.1 Methods paragraphs
- One or two sentences describing:
  - Data source (KM curves, pseudo-IPD).
  - Analytical technique (PH test, parametric families, piecewise, splines).
  - Reference to guidance where relevant (TSD 14/16/21).

**Example pattern**
> “Overall survival was modelled using reconstructed individual-level data derived from published Kaplan–Meier curves. A range of standard parametric distributions (exponential, Weibull, Gompertz, log-normal, log-logistic, gamma, generalized gamma) and flexible models were fitted, consistent with NICE DSU TSD 14 and TSD 21.”

### 5.2 Diagnostic/result paragraphs
- Report directionally what diagnostics showed, not step-by-step code detail.
- Emphasize:
  - PH result (supported / not supported).
  - Which models fit well/poorly (qualitative).
  - How long-term tails behaved (plausible / implausible).

**Example pattern**
> “The global Schoenfeld test indicated statistically significant deviation from proportional hazards (p < 0.001), and log-cumulative hazard plots showed increasing separation of the two arms over time. These findings suggest that proportional hazards do not hold.”

### 5.3 Interpretation/justification paragraphs
- Explicitly connect diagnostics to modelling decisions:
  - “Therefore, independent models were used…”
  - “Consequently, log-logistic and log-normal were deprioritised…”
  - “On this basis, the piecewise exponential model was selected…”

**Example pattern**
> “Given the evidence of non-proportional hazards and the presence of a structural change in the hazard around Week 32, a piecewise approach was judged more appropriate than a single-piece parametric model. Among the piecewise candidates, the piecewise exponential model provided the best balance of fit and plausibility.”

---

## 6. Preferred Phrasing and Common Constructions

Use the following types of phrases frequently; they are characteristic of NICE/DSU style.

### 6.1 Methods and guidance
- “In line with NICE DSU TSD 14…”
- “Consistent with published guidance…”
- “Following the approach described by Guyot et al. (2012)…”
- “A range of parametric models was explored, including…”

### 6.2 PH and modelling structure
- “The proportional hazards assumption was assessed using…”
- “The assumption was not supported, and independent parametric models were therefore fitted for each arm.”
- “Where proportional hazards appeared reasonable, pooled models with a common shape parameter were considered.”

### 6.3 Fit and plausibility
- “The model provided an adequate representation of the observed KM data over the trial follow-up.”
- “Log-logistic and log-normal distributions were rejected as base-case options due to heavy-tailed extrapolations.”
- “Extrapolated survival estimates were consistent with expectations for metastatic NSCLC.”

### 6.4 Piecewise and cut-points
- “Visual inspection of the KM and hazard functions suggested a change in hazard around {time}, supporting the use of a piecewise specification.”
- “The cut-point was selected based on a combination of statistical change-point tests and clinical judgement.”

### 6.5 Sensitivities and uncertainty
- “Alternative specifications were considered in sensitivity analyses.”
- “These alternative models produced results broadly similar to the base case.”
- “Differences were explored in scenario analyses.”

---

## 7. Style “Do” and “Do Not”

### 7.1 Do
- Do be **precise** and **concise**.
- Do explicitly connect modelling choices to:
  - Diagnostics (PH tests, AIC/BIC, visual fit).
  - Clinical plausibility.
  - NICE DSU guidance.
- Do use hedging when appropriate:
  - “appears to”, “is consistent with”, “suggests that”.
- Do explain why models are **rejected**, not only why one is **chosen**.

### 7.2 Do not
- Do not claim causality or proof:
  - Avoid “proves that”, “demonstrates conclusively”.
- Do not use colloquial expressions or rhetorical questions.
- Do not over-interpret beyond the modelling results (e.g., do not claim treatment is “curative” unless a cure model is explicitly justified).
- Do not invent numerical results; if a value is not provided in the input JSON, describe qualitatively or state that it is “not estimable from the available data”.

---

## 8. Numerical Reporting Conventions

- Use the numbers given by the deterministic SurvLab+ pipeline **exactly**, without alteration.
- Rounding:
  - Hazard ratios: 2 decimal places (e.g., 0.60).
  - p-values: 3 decimal places (or “p < 0.001”).
  - Survival probabilities: 1 or 2 decimal places (e.g., 0.72 or 72%).
  - Time: specify units (months or weeks) explicitly.
- Clearly distinguish between:
  - **Observed** metrics (within follow-up).
  - **Extrapolated** metrics (beyond observed follow-up).
- For medians:
  - If not reached: write “the median was not reached (NR) over the observed follow-up”.
  - If extrapolated: “The model predicts an extrapolated median of X months; this value is model-based and should be interpreted with caution.”

---

## 9. Survival Modelling–Specific Language

### 9.1 Proportional hazards
- “The proportional hazards assumption was supported / not supported.”
- “Evidence of non-proportional hazards justified the use of independent arm-specific models.”

### 9.2 Parametric model families
When listing families, keep the order and casing consistent:
- “exponential, Weibull, Gompertz, log-normal, log-logistic, gamma, generalized gamma”

When discussing a chosen family:
- “A Weibull distribution was selected for the pembrolizumab arm.”
- “An exponential distribution was retained for the chemotherapy arm, reflecting an approximately constant hazard over time.”

### 9.3 Piecewise models
- “A piecewise model was specified with a cut-point at {time}.”
- “KM data were used up to {time}, followed by a parametric tail.”
- “This structure is consistent with previous evaluations of KEYNOTE-024 and with NICE DSU TSD 16 guidance on piecewise modelling.”

### 9.4 Flexible / spline models
- “Flexible Royston–Parmar spline models with 2–4 degrees of freedom were evaluated to assess whether additional flexibility improved fit.”
- “Spline models were retained as sensitivity analyses rather than as the base-case specification.”

### 9.5 Extrapolation and external validation
- “Extrapolations were compared with age- and sex-adjusted all-cause mortality from SEER life tables.”
- “Long-term survival estimates were within plausible ranges for metastatic NSCLC.”
- “Models predicting very high long-term survival (e.g., >20% at 10 years) were considered implausible and deprioritised.”

### 9.6 Switching and crossover
- “Treatment switching from chemotherapy to pembrolizumab was addressed using {method} in scenario analyses.”
- “Results with and without adjustment were compared to assess the impact of crossover on OS estimates.”

---

## 10. Handling Uncertainty and Limitations

- Acknowledge uncertainties transparently.
- Use phrases such as:
  - “These projections are subject to uncertainty, particularly in the late tail where few patients remain at risk.”
  - “The choice of cut-point is partly driven by clinical judgement, and alternative cut-points were explored in sensitivity analyses.”
  - “Digitisation of KM curves may introduce minor approximation error; however, reconstructed curves closely matched the published KM.”

Avoid:
- “The extrapolation is accurate.”
- “There is no uncertainty.”

---

## 11. Tables, Figures, and Captions

- Refer to tables and figures explicitly:
  - “Table 1 summarises candidate model fit statistics.”
  - “Figure 2 shows the overlay of KM and fitted survival curves.”
- Captions should be descriptive but concise:
  - “Figure 1. Observed KM and fitted survival curves for OS (base-case Weibull model).”
  - “Table 2. Parametric model fit statistics (AIC, BIC) for OS.”

---

## 12. Citations and References (High-Level Style)

- When referencing guidance:
  - “In line with NICE DSU Technical Support Document 14…”
  - “As described in TSD 21…”
- When referencing trial publications or CEAs:
  - “This approach is consistent with the survival modelling adopted in the published cost-effectiveness analysis of KEYNOTE-024.”

Do not include full reference formatting unless explicitly requested; keep citations in **inline narrative form** (as above). A separate reference list can be appended by the system if needed.

---

## 13. LLM Behaviour Rules (Important)

When generating text using this style:

1. **Never** invent or adjust numerical results. Use only values provided by the deterministic analysis JSON.
2. If a required value is missing, describe qualitatively or say it is “not estimable from the available data”; do not guess.
3. Do not describe methods that were not actually used by the pipeline.
4. When in doubt, **err on the side of conservative and cautious language.**
5. Prefer short, structured paragraphs over long, complex ones.
6. Always link modelling decisions back to:
   - Diagnostics (PH, AIC/BIC, visual fit, tail checks),
   - Clinical plausibility,
   - NICE DSU guidance.

---

## 14. Quick Style Checklist

Before finalising a report, ensure:

- [ ] Voice is formal, neutral, third-person (no “we”).
- [ ] Methods → diagnostics → justification → sensitivity appear in that order.
- [ ] PH assessment and its consequences are clearly described.
- [ ] Model choice is justified with both statistical and clinical arguments.
- [ ] Implausible models are explicitly noted and deprioritised.
- [ ] Extrapolation plausibility is discussed, not just in-trial fit.
- [ ] Sensitivity analyses are briefly summarised.
- [ ] Uncertainties and limitations are acknowledged.
- [ ] Language matches NICE/DSU style (no promotional or casual wording).
- [ ] No numerical values appear that are not present in the input JSON.

