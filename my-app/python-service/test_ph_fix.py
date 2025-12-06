
import unittest
from unittest.mock import MagicMock, patch
import pandas as pd
import numpy as np

# Import the function to test
# We need to mock the imports inside ph_testing because we might not have all dependencies installed in this environment
# or we want to isolate the logic.
# However, since we are in the same environment, we can try importing directly.
# If dependencies are missing, we will mock them.

import sys
import os

# Add the directory to path
sys.path.append('/Users/ansberthafreiku/dev/SurvivalAgent/my-app/python-service')

# Mock matplotlib to avoid display issues
sys.modules['matplotlib'] = MagicMock()
sys.modules['matplotlib.pyplot'] = MagicMock()
sys.modules['lifelines'] = MagicMock()
sys.modules['lifelines.statistics'] = MagicMock()

# Now import the module
from ph_testing import test_proportional_hazards

class TestPHLogic(unittest.TestCase):
    def setUp(self):
        # Mock data
        self.chemo_data = {'time': [1, 2, 3], 'event': [1, 1, 1]}
        self.pembro_data = {'time': [1, 2, 3], 'event': [1, 1, 1]}

    @patch('ph_testing.logrank_test')
    @patch('ph_testing.CoxPHFitter')
    @patch('ph_testing.proportional_hazard_test')
    @patch('ph_testing.generate_ph_diagnostic_plots')
    def test_ph_logic_logrank_ignored(self, mock_plots, mock_ph_test, mock_cph, mock_logrank):
        # Setup mocks
        
        # 1. Log-rank is significant (p < 0.05) -> Should NOT cause PH violation
        mock_logrank_result = MagicMock()
        mock_logrank_result.p_value = 0.001
        mock_logrank.return_value = mock_logrank_result
        
        # 2. Schoenfeld is NOT significant (p > 0.05)
        mock_ph_summary = MagicMock()
        # Mocking the summary dataframe access
        mock_ph_summary.summary.index = ['treatment']
        mock_ph_summary.summary.loc.__getitem__.return_value = 0.6 # p-value
        mock_ph_test.return_value = mock_ph_summary
        
        # 3. Chow test (internal logic) -> We need to control the data to make chow p-value > 0.05
        # The current implementation calculates chow p-value based on hazard ratios.
        # Let's just mock the internal calculation if possible, or construct data such that HRs are similar.
        # Actually, the function calculates chow_pvalue internally. 
        # Let's rely on the fact that with identical small data, HRs might be unstable or identical.
        # To be safe, let's patch the internal logic or just inspect the result.
        
        # Actually, we can't easily patch local variables. 
        # Let's look at the code: 
        # hr_diff = abs(hr_early - hr_late)
        # chow_pvalue = 0.01 if hr_diff > 0.3 else 0.5
        
        # We want chow_pvalue = 0.5 (not significant)
        # So we need hr_diff <= 0.3
        # If we provide identical data for early and late periods (which is hard with 3 points), 
        # let's just assume the simple data above might result in something.
        # Better approach: The function is imported. We can't easily mock the internal logic without refactoring.
        # However, we can check if the logrank p-value is ignored.
        
        # Let's run the function
        result = test_proportional_hazards(self.chemo_data, self.pembro_data)
        
        # Check inputs to logic
        print(f"Logrank p: {result['logrank_pvalue']}")
        print(f"Schoenfeld p: {result['schoenfeld_pvalue']}")
        print(f"Chow p: {result['chow_test_pvalue']}")
        
        # ASSERTION: 
        # If logrank is 0.001 (significant)
        # And Schoenfeld is 0.6 (not significant)
        # And Chow is likely 0.5 (not significant with this dummy data? we'll see)
        # Then ph_violated should be FALSE.
        
        # If the old logic was in place, ph_violated would be TRUE because logrank < 0.05.
        
        # Note: We need to ensure Chow is not significant.
        # With the dummy data [1,2,3], mid_time = 3. 
        # early = [1,2,3], late = []. This might cause division by zero or empty checks.
        # The code handles empty: "if chemo_hr_early > 0 and chemo_hr_late > 0".
        # If not, chow_pvalue = 0.5.
        # So with this data, chow_pvalue will be 0.5.
        
        self.assertEqual(result['chow_test_pvalue'], 0.5)
        self.assertEqual(result['schoenfeld_pvalue'], 0.6)
        self.assertEqual(result['logrank_pvalue'], 0.001)
        
        # The Critical Test:
        self.assertFalse(result['ph_violated'], "PH should NOT be violated just because Log-rank is significant")
        self.assertEqual(result['decision'], "pooled_model")

if __name__ == '__main__':
    unittest.main()
