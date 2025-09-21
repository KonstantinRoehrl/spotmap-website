import { Routes } from '@angular/router';
import { MapComponent } from './modules/pages/map/map.component';
import { HomeComponent } from './modules/pages/home/home.component';
import { AboutComponent } from './modules/pages/about/about.component';
import { AppComponent } from './app.component';

export const routes: Routes = [
  { path: 'home', component: HomeComponent },
  { path: 'map', component: MapComponent },
  { path: 'about', component: AboutComponent },
  { path: '**', redirectTo: 'home' }
];
