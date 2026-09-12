import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CityEnum } from '../models/enums/map-enum';
import { SpotsService } from './spots.service';

describe('SpotsService', () => {
  let service: SpotsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SpotsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests the city asset with a base-relative url', () => {
    service.loadSpots(CityEnum.Vienna).subscribe();
    const req = httpMock.expectOne('spots/vienna.geojson');
    expect(req.request.url.startsWith('/')).toBe(false);
    req.flush({ type: 'FeatureCollection', features: [] });
  });

  it('surfaces a transport failure to the caller', (done) => {
    service.loadSpots(CityEnum.Vienna).subscribe({
      next: () => done.fail('expected an error'),
      error: (err) => {
        expect(err.status).toBe(404);
        done();
      },
    });
    httpMock
      .expectOne('spots/vienna.geojson')
      .flush('missing', { status: 404, statusText: 'Not Found' });
  });
});
