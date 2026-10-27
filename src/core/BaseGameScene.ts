import Phaser from 'phaser';
import { Sfx } from './audio/Sfx';
import { DevInput, isDev } from './input/DevInput';
import { PlayerInput } from './input/PlayerInput';
import { H, W } from './layout';
import { MatchState } from './match/MatchState';
import { PAUSE_SIZE } from './theme';
import { PLAYERS, type PlayerId } from './types';
import { Button } from '../ui/Button';
import { runCountdown } from '../ui/Countdown';
import { drawRink } from '../ui/drawRink';
import { ScoreBadge } from '../ui/ScoreBadge';

/** Distance of the pause buttons from the screen corner, and the size of their touch target. */
const PAUSE_CORNER = 56;
const PAUSE_HIT = 150;

export interface GameSceneData {
  gameId: string;
}

/**
 * Shared game flow: rink, score badges, pause buttons, PlayerInput, 3-2-1-GO, scoring and hand-off to Win.
 * Subclasses override the on* hooks and call `score(player)` when a point is won.
 */
export abstract class BaseGameScene extends Phaser.Scene {
  protected match!: MatchState;
  protected players!: PlayerInput;
  protected running = false;
  protected badges: ScoreBadge[] = [];
  private devInput?: DevInput;

  constructor(key: string, private gameId: string, private target = 5) {
    super(key);
  }

  create(): void {
    this.running = false;
    this.match = new MatchState({ target: this.target });
    this.drawBackground();
    this.players = new PlayerInput(this);
    if (isDev()) {
      this.devInput = new DevInput(this.players);
      this.events.once('shutdown', () => this.devInput?.destroy());
    }
    this.badges = PLAYERS.map((p) => new ScoreBadge(this, p, 100, -300));
    // Pause sits in a far corner (player 0 bottom-left, player 1 top-right), away from where play happens, and is a plain tap
    // with a generous touch target (bigger than the drawn button) so it never needs a second try.
    PLAYERS.forEach((p) => {
      const x = p === 0 ? PAUSE_CORNER : W - PAUSE_CORNER;
      const y = p === 0 ? H - PAUSE_CORNER : PAUSE_CORNER;
      // only a touch that STARTED on the button counts: a finger released here at the end of a drag/pull must not pause
      let armed = false;
      const b = new Button(this, x, y, 'II', () => {
        if (armed) this.pauseGame();
        armed = false;
      }, { w: PAUSE_SIZE, h: PAUSE_SIZE, size: 36, player: p, round: true }).setDepth(50);
      b.on('pointerdown', () => (armed = true));
      b.on('pointerout', () => (armed = false));
      b.removeInteractive();
      b.setSize(PAUSE_HIT, PAUSE_HIT);
      b.setInteractive({ useHandCursor: true });
    });
    this.onCreate();
    this.events.on('resume', () => (this.running = true));
    runCountdown(this, () => {
      this.running = true;
      this.onStart();
    });
  }

  update(time: number, delta: number): void {
    this.devInput?.update();
    if (this.running) this.onTick(time, delta);
  }

  /** Award a point; ends the match (-> Win scene) when the target is reached. */
  protected score(p: PlayerId): void {
    const winner = this.match.addPoint(p);
    this.badges[p].setScore(this.match.scores[p]);
    Sfx.score();
    if (winner !== null) {
      this.running = false;
      Sfx.win();
      this.time.delayedCall(500, () =>
        this.scene.start('Win', { gameId: this.gameId, sceneKey: this.scene.key, winner, scores: [...this.match.scores] }),
      );
    }
  }

  protected pauseGame(): void {
    this.running = false;
    this.scene.launch('Pause', { gameId: this.gameId, sceneKey: this.scene.key });
    this.scene.bringToTop('Pause'); // Pause is registered before the games, so it would draw underneath
    this.scene.pause();
  }

  /** Override to draw a game-specific table; default is the shared rink. */
  protected drawBackground(): void {
    drawRink(this);
  }

  protected onCreate(): void {}
  protected onStart(): void {}
  protected onTick(_time: number, _delta: number): void {}
}
