import unittest

class TestPlotLogic(unittest.TestCase):
    def calculate_max_time(self, times):
        # Logic from plotting.py
        if len(times) > 0:
            max_observed = max(times)
            max_time = max(max_observed + 1, 6)
        else:
            max_time = 30 # Fallback
        return max_time

    def test_short_duration(self):
        times = [1, 2, 3]
        # Max observed = 3. 3+1 = 4. Min is 6. Should be 6.
        self.assertEqual(self.calculate_max_time(times), 6)

    def test_normal_duration(self):
        times = [1, 10, 20]
        # Max observed = 20. 20+1 = 21. Should be 21.
        self.assertEqual(self.calculate_max_time(times), 21)

    def test_empty_data(self):
        times = []
        # Fallback. Should be 30.
        self.assertEqual(self.calculate_max_time(times), 30)

if __name__ == '__main__':
    unittest.main()
