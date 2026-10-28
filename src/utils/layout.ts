export function needsScroll(viewportHeight: number, contentHeight: number): boolean {
  return viewportHeight > 0 && contentHeight > viewportHeight + 1;
}

export function homeLayout(width: number, height: number) {
  return {
    columns: width >= 600 || (width > height && width >= 480) ? 2 : 1,
    compact: height < 640,
  } as const;
}
