export class RightPress {
  private press = 0;
  private aimed = -1;

  down(): void {
    this.press++;
  }

  aim(): void {
    this.aimed = this.press;
  }

  swallowsMenu(): boolean {
    return this.aimed === this.press;
  }
}

export const releaseClicks = (button: number): boolean => button === 0;
