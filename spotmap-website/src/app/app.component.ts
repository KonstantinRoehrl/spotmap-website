import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MapContainerComponent } from './modules/components/map-container/map-container.component';
import { AsciiAnimationTextComponent } from './modules/components/ascii-animation-text/ascii-animation-text.component';
import { NavBarComponent } from './modules/components/nav-bar/nav-bar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MapContainerComponent, AsciiAnimationTextComponent, NavBarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit{
  title = 'spotmap-website';
  protected introFinished = signal<boolean>(false);

  constructor(private router: Router){

  }

  ngOnInit(): void {
    this.router.navigate([""])
  }

  protected onIntroFinished(){
    this.router.navigate(["map"])
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
