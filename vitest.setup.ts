import '@testing-library/jest-dom';
// jsdom lacks scrollTo; stub it to avoid errors from framer-motion animations
if (!('scrollTo' in window)) {
  // @ts-ignore
  window.scrollTo = () => {};
}
