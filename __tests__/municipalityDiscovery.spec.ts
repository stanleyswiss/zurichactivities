let updateMock: jest.Mock;

jest.mock('@/lib/db', () => {
  updateMock = jest.fn().mockResolvedValue({});
  return {
    db: {
      municipality: {
        update: updateMock,
      },
      $disconnect: jest.fn(),
    },
  };
});

import { verifyMunicipalityEventPage } from '@/app/api/municipalities/bulk-verify/route';

jest.setTimeout(60000);

describe('municipality event discovery integration', () => {

  beforeEach(() => {
    updateMock.mockClear();
  });

  it('discovers the Schlieren event page with strong confidence', async () => {
    const result = await verifyMunicipalityEventPage({
      id: 'test-schlieren',
      name: 'Schlieren',
      websiteUrl: 'https://www.schlieren.ch',
      cmsType: 'typo3',
    });

    expect(result.success).toBe(true);
    expect(result.eventPageUrl).toBeTruthy();
    expect(result.eventPageUrl).toContain('schlieren.ch');
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventPageConfidence: expect.any(Number),
        }),
      })
    );
  });

  it('discovers the Dietikon event page with strong confidence', async () => {
    const result = await verifyMunicipalityEventPage({
      id: 'test-dietikon',
      name: 'Dietikon',
      websiteUrl: 'https://www.dietikon.ch',
      cmsType: 'typo3',
    });

    expect(result.success).toBe(true);
    expect(result.eventPageUrl).toBeTruthy();
    expect(result.eventPageUrl).toContain('dietikon.ch');
    expect(result.confidence).toBeGreaterThan(0.6);
  });
});
