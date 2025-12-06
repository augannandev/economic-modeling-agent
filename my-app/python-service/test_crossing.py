import unittest
import numpy as np
import pandas as pd
from lifelines import KaplanMeierFitter
from ph_testing import test_proportional_hazards

class TestCrossingDetection(unittest.TestCase):
    
    def create_synthetic_data(self, pattern='crossing'):
        """
        Create synthetic time/event data for different patterns.
        """
        # Base times
        times = np.linspace(0, 20, 100)
        
        if pattern == 'crossing':
            # Chemo: Linear decay
            # Pembro: Slower decay but starts lower (artificial crossing)
            # We construct data to force KM to look like this
            pass 
            # Actually, it's hard to reverse engineer KM data perfectly.
            # Instead, we can mock the KM fitter or just create simple datasets
            # that we know will produce crossing lines.
            
            # Simple approach: 
            # Group 1 (Chemo): Events early
            # Group 2 (Pembro): Events late
            
            # Crossing: Group 1 drops fast then plateaus. Group 2 drops slow then fast.
            # Actually, standard crossing:
            # G1: High hazard early, low hazard late
            # G2: Low hazard early, high hazard late
            
            # Let's use simple small datasets
            
            # Crossing at t=2.5
            # G1: [1, 2, 3, 4, 5] (events)
            # G2: [1, 2, 3, 4, 5] (events)
            # Wait, that's identical.
            
            # Let's try to construct specific survival curves by defining events
            
            # Case 1: Crossing
            # G1 (Chemo): [1, 1, 1, 5, 5, 5] -> Drops at 1 and 5
            # G2 (Pembro): [2, 2, 2, 3, 3, 3] -> Drops at 2 and 3
            
            # t=0: S1=1, S2=1
            # t=1: S1=0.5, S2=1
            # t=2: S1=0.5, S2=0.5 (Touch/Cross?)
            # t=3: S1=0.5, S2=0
            # t=5: S1=0, S2=0
            
            # Let's make it clearer
            # G1: Events at [1, 1, 1, 10, 10] (N=5)
            # t=0: 1.0
            # t=1: 0.2 (Huge drop)
            # t=10: 0.0
            
            # G2: Events at [2, 2, 5, 5, 5] (N=5)
            # t=0: 1.0
            # t=1: 1.0 (Higher than G1)
            # t=2: 0.6
            # t=5: 0.0 (Crosses G1? No, G1 is 0.2)
            
            # Wait, G1 is 0.2 from t=1 to t=10.
            # G2 is 1.0 at t=1, 0.6 at t=2, 0.0 at t=5.
            # So G2 starts higher (1.0 > 0.2) and ends lower (0.0 < 0.2) at t=5?
            # Yes. Crossing between t=2 and t=5.
            
            chemo_data = {'time': [1, 1, 1, 1, 10], 'event': [1, 1, 1, 1, 1]}
            pembro_data = {'time': [2, 2, 5, 5, 5], 'event': [1, 1, 1, 1, 1]}
            
            return chemo_data, pembro_data

        elif pattern == 'no_crossing':
            # G1 always below G2
            # G1: [1, 2, 3]
            # G2: [4, 5, 6]
            chemo_data = {'time': [1, 2, 3], 'event': [1, 1, 1]}
            pembro_data = {'time': [4, 5, 6], 'event': [1, 1, 1]}
            return chemo_data, pembro_data
            
        elif pattern == 'touching':
            # Curves touch but don't cross
            # G1: [1, 5]
            # G2: [1, 5]
            # Identical -> No crossing (diff = 0)
            chemo_data = {'time': [1, 5], 'event': [1, 1]}
            pembro_data = {'time': [1, 5], 'event': [1, 1]}
            return chemo_data, pembro_data
            
        elif pattern == 'late_noise':
            # Crossing at t=15 but very small magnitude
            # We need high N to get small steps
            # This is hard to construct manually with small lists.
            # We'll skip for now or use large random data.
            pass

    def test_crossing_detected(self):
        c_data, p_data = self.create_synthetic_data('crossing')
        result = test_proportional_hazards(c_data, p_data)
        
        print(f"\nCrossing Test Result: Detected={result['crossing_detected']}, Time={result['crossing_time']}")
        self.assertTrue(result['crossing_detected'])
        self.assertIsNotNone(result['crossing_time'])

    def test_no_crossing(self):
        c_data, p_data = self.create_synthetic_data('no_crossing')
        result = test_proportional_hazards(c_data, p_data)
        
        print(f"\nNo Crossing Test Result: Detected={result['crossing_detected']}")
        self.assertFalse(result['crossing_detected'])
        self.assertIsNone(result['crossing_time'])
        
    def test_touching_identical(self):
        c_data, p_data = self.create_synthetic_data('touching')
        result = test_proportional_hazards(c_data, p_data)
        
        print(f"\nTouching Test Result: Detected={result['crossing_detected']}")
        # Identical curves (diff=0) should NOT trigger crossing
        self.assertFalse(result['crossing_detected'])

if __name__ == '__main__':
    unittest.main()
