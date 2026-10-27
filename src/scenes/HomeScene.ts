import Phaser from 'phaser';
import { t } from '../core/i18n';
import { H, W } from '../core/layout';
import { gameTitle, getGames } from '../core/registry';
import { COLORS } from '../core/theme';
import type { GameModule } from '../core/types';
import { Button } from '../ui/Button';
import { HoldButton } from '../ui/HoldButton';
import { RotatedLabel } from '../ui/RotatedLabel';
import { drawRinkIcon, makeTile, mx, my, type TileIcon } from '../ui/homeTiles';

/** Icons of the first games, drawn by homeTiles; newer games bring their own `drawIcon`. */
const LEGACY_ICON: Record<string, TileIcon> = { tugofwar: 'tug', tablefootball: 'football', connect4: 'connect4', binbasketball: 'bin' };

/** Tile size and grid in mockup units (see homeTiles). */
const TILE_W = 268;
const TILE_H = 300;
const COL_X = [76, 368, 660, 952];
const ROW_Y = [112, 436];
const SWIPE_PX = 120;

/** Home menu: every game as a tile, in swipeable pages of 4x2. */
export class HomeScene extends Phaser.Scene {
  private pages: GameModule[][] = [];
  private page = 0;
  private pageObjects: Phaser.GameObjects.GameObject[] = [];
  private dots!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Home');
  }

  create(): void {
    const games = getGames().filter((g) => g.id !== 'dummy');
    const perPage = COL_X.length * ROW_Y.length;
    this.pages = [];
    for (let i = 0; i < games.length; i += perPage) this.pages.push(games.slice(i, i + perPage));
    this.page = Math.min(this.registry.get('homePage') ?? 0, this.pages.length - 1);

    this.add.rectangle(960, 540, 1920, 1080, COLORS.bg);
    this.logo(mx(64) + 30, my(56));
    new RotatedLabel(this, mx(64) + 80, my(56), t('appName'), null, { size: 44, color: COLORS.text2, display: true }).setOrigin(0, 0.5);
    new HoldButton(this, mx(1216) - 190, my(56), t('spike'), () => this.scene.start('DevSpike'), { w: 380, h: 80, size: 30, round: true });

    this.dots = this.add.graphics();
    if (this.pages.length > 1) {
      new Button(this, 70, 540, '‹', () => this.go(-1), { w: 90, h: 90, size: 64, round: true });
      new Button(this, W - 70, 540, '›', () => this.go(1), { w: 90, h: 90, size: 64, round: true });
      this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
        const dx = p.upX - p.downX;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > 2 * Math.abs(p.upY - p.downY)) this.go(dx < 0 ? 1 : -1);
      });
    }
    this.build();
  }

  private go(dir: number): void {
    const next = Phaser.Math.Clamp(this.page + dir, 0, this.pages.length - 1);
    if (next === this.page) return;
    this.page = next;
    this.build();
  }

  /** (Re)draws the current page's tiles and the page dots. */
  private build(): void {
    this.registry.set('homePage', this.page);
    this.pageObjects.forEach((o) => o.destroy());
    const before = this.children.list.length;
    const games = this.pages[this.page];
    games.forEach((g, i) => {
      makeTile(this, {
        x: COL_X[i % COL_X.length],
        y: ROW_Y[Math.floor(i / COL_X.length)],
        w: TILE_W,
        h: TILE_H,
        title: gameTitle(g),
        icon: LEGACY_ICON[g.id] ?? 'tug',
        drawIcon: g.id === 'airhockey' ? (gr) => drawRinkIcon(gr) : g.drawIcon,
        // a swipe that starts on a tile must not launch it
        onTap: () => {
          if (this.input.activePointer.getDistance() < 30) this.scene.start(g.sceneKey, { gameId: g.id });
        },
      });
    });
    this.pageObjects = this.children.list.slice(before);
    this.drawDots();
  }

  private drawDots(): void {
    const g = this.dots.clear();
    const n = this.pages.length;
    if (n < 2) return;
    for (let i = 0; i < n; i++) g.fillStyle(i === this.page ? COLORS.text : COLORS.border, i === this.page ? 1 : 0.7).fillCircle(W / 2 + (i - (n - 1) / 2) * 44, H - 36, 11);
  }

  private logo(x: number, y: number): void {
    const g = this.add.graphics({ x, y });
    g.lineStyle(3, COLORS.text, 1).strokeCircle(0, 0, 27).strokeCircle(0, 0, 15);
    g.fillStyle(COLORS.text, 1).fillCircle(0, 0, 5);
  }
}
