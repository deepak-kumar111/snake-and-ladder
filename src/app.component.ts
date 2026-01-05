
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from './services/game.service';
import { SetupComponent } from './components/setup.component';
import { BoardComponent } from './components/board.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, SetupComponent, BoardComponent],
  templateUrl: './app.component.html'
})
export class AppComponent {
  gameService = inject(GameService);
}
