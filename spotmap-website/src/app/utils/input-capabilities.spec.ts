import { canHover } from './input-capabilities';

describe('canHover', () => {
  function pointer(hover: boolean): jasmine.Spy {
    return spyOn(window, 'matchMedia').and.callFake(
      (query: string) =>
        ({
          matches: hover && query === '(hover: hover)',
          media: query,
        }) as MediaQueryList,
    );
  }

  it('answers true for a pointer that can hover', () => {
    pointer(true);
    expect(canHover()).toBeTrue();
  });

  it('answers false for a pointer that cannot', () => {
    pointer(false);
    expect(canHover()).toBeFalse();
  });

  it('asks again on each call, so a hybrid device keeps up', () => {
    const media = pointer(true);
    canHover();
    canHover();
    expect(media).toHaveBeenCalledTimes(2);
  });
});
