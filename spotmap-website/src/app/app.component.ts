import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MapContainerComponent } from './modules/map-container/map-container.component';
import { AsciiAnimationTextComponent } from './modules/ascii-animation-text/ascii-animation-text.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MapContainerComponent, AsciiAnimationTextComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'spotmap-website';
  protected introFinished = signal<boolean>(false);

  protected onIntroFinished(){
    this.introFinished.set(true);
  }

  protected mapsLink = "https://www.google.com/maps/d/u/0/embed?mid=13c9hk1PqIRE5jgjTAr1pf4sP_9GNiIg&ehbc=2E312F";

  headerText = `$$\\    $$\\ $$\\                                                           
$$ |   $$ |\\__|                                                          
$$ |   $$ |$$\\  $$$$$$\\  $$$$$$$\\  $$$$$$$\\   $$$$$$\\                    
\\$$\\  $$  |$$ |$$  __$$\\ $$  __$$\\ $$  __$$\\  \\____$$\\                   
 \\$$\\$$  / $$ |$$$$$$$$ |$$ |  $$ |$$ |  $$ | $$$$$$$ |                  
  \\$$$  /  $$ |$$   ____|$$ |  $$ |$$ |  $$ |$$  __$$ |                  
   \\$  /   $$ |\\$$$$$$$\\ $$ |  $$ |$$ |  $$ |\\$$$$$$$ |                  
    \\_/    \\__| \\_______|\\__|  \\__|\\__|  \\__| \\_______|                  
                                                                         
                                                                         
                                                                         
 $$$$$$\\                       $$\\                                       
$$  __$$\\                      $$ |                                      
$$ /  \\__| $$$$$$\\   $$$$$$\\ $$$$$$\\   $$$$$$\\$$$$\\   $$$$$$\\   $$$$$$\\  
\\$$$$$$\\  $$  __$$\\ $$  __$$\\\\_$$  _|  $$  _$$  _$$\\  \\____$$\\ $$  __$$\\ 
 \\____$$\\ $$ /  $$ |$$ /  $$ | $$ |    $$ / $$ / $$ | $$$$$$$ |$$ /  $$ |
$$\\   $$ |$$ |  $$ |$$ |  $$ | $$ |$$\\ $$ | $$ | $$ |$$  __$$ |$$ |  $$ |
\\$$$$$$  |$$$$$$$  |\\$$$$$$  | \\$$$$  |$$ | $$ | $$ |\\$$$$$$$ |$$$$$$$  |
 \\______/ $$  ____/  \\______/   \\____/ \\__| \\__| \\__| \\_______|$$  ___`;

}
