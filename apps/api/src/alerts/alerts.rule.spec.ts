import { isLcpDegraded, isRateDegraded } from './alerts.service';

describe('isLcpDegraded', () => {
  it('ignores a page that stays under the good line', () => {
    expect(isLcpDegraded(2400, 1800)).toBe(false);
  });

  it('ignores a slow page that has not moved past its baseline', () => {
    expect(isLcpDegraded(3200, 3000)).toBe(false);
  });

  it('fires when the recent window is more than 20% slower than the baseline', () => {
    expect(isLcpDegraded(3200, 2000)).toBe(true);
  });

  it('fires a poor sample when there is no baseline yet', () => {
    expect(isLcpDegraded(3200, null)).toBe(true);
  });

  it('fires at 4 seconds even if the baseline is already poor', () => {
    expect(isLcpDegraded(4100, 4000)).toBe(true);
  });
});

describe('isRateDegraded', () => {
  it('ignores a rate that stays inside the poor line', () => {
    expect(isRateDegraded(0.4, null, 1, 10)).toBe(false);
  });

  it('fires a poor rate when there is no baseline', () => {
    expect(isRateDegraded(2.5, null, 1, 10)).toBe(true);
  });

  it('ignores a poor rate that has not moved 20% past its baseline', () => {
    expect(isRateDegraded(1.5, 1.4, 1, 10)).toBe(false);
  });

  it('fires when the rate is more than 20% above the baseline', () => {
    expect(isRateDegraded(3, 2, 1, 10)).toBe(true);
  });

  it('fires the severe line even if the baseline is already high', () => {
    expect(isRateDegraded(12, 11, 2, 10)).toBe(true);
  });
});
