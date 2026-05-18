import type { ViewportProfile } from './types';

export const responsiveViewports: ViewportProfile[] = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

export function viewportByName(name: string) {
  return responsiveViewports.find((viewport) => viewport.name === name);
}
