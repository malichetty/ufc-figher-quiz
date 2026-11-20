// The fame ladder (PRD decisions 2, 3 and 3b), top level first. Every fighter
// in the pool sits on exactly one level, and matching leans toward the higher
// ones by `fame`. A current champion who is not named here sits on the bottom
// level: a belt alone is not top fame. Names must match the UFC Stats API
// exactly; scripts/build-roster.mjs warns on a miss.
export const FAME_LADDER = [
  {
    // The all-time greats and the biggest names.
    level: 'goat',
    fame: 1,
    names: [
      'Jon Jones', 'Khabib Nurmagomedov', 'Georges St-Pierre', 'Anderson Silva', 'Conor McGregor',
      'Amanda Nunes', 'Ronda Rousey', 'Chuck Liddell', 'Demetrious Johnson', 'Daniel Cormier',
    ],
  },
  {
    // The fighters fans follow now.
    level: 'favourite',
    fame: 0.8,
    names: [
      'Islam Makhachev', 'Ilia Topuria', 'Alexander Volkanovski', 'Joshua Van', 'Merab Dvalishvili',
      'Petr Yan', 'Carlos Prates', 'Tom Aspinall', 'Ciryl Gane', 'Josh Hokit', 'Alex Pereira',
      'Israel Adesanya', 'Khamzat Chimaev', 'Dricus Du Plessis', 'Jiri Prochazka', 'Nate Diaz',
      'Max Holloway', 'Dustin Poirier', 'Charles Oliveira', 'Justin Gaethje', "Sean O'Malley",
      'Francis Ngannou',
    ],
  },
  {
    // Proven champions.
    level: 'great',
    fame: 0.5,
    names: [
      'Jose Aldo', 'Stipe Miocic', 'Randy Couture', 'Matt Hughes', 'BJ Penn', 'Cain Velasquez',
      'Henry Cejudo', 'Kamaru Usman', 'Valentina Shevchenko',
    ],
  },
  {
    // Former champions, contenders and names fans know.
    level: 'star',
    fame: 0.3,
    names: [
      'Tito Ortiz', 'Junior Dos Santos', 'Brock Lesnar', 'Nick Diaz', 'Donald Cerrone', 'Tony Ferguson',
      'Jorge Masvidal', 'Michael Bisping', 'Lyoto Machida', 'Mauricio Rua', 'Rashad Evans',
      'Frankie Edgar', 'Dominick Cruz', 'TJ Dillashaw', 'Joanna Jedrzejczyk', 'Holly Holm',
      'Miesha Tate', 'Cristiane Justino', 'Glover Teixeira', 'Robbie Lawler', 'Tyron Woodley',
      'Carlos Condit', 'Wanderlei Silva', 'Vitor Belfort', 'Forrest Griffin', 'Quinton Jackson',
      'Dan Henderson', 'Chris Weidman', 'Luke Rockhold', 'Anthony Pettis', 'Eddie Alvarez',
      'Urijah Faber', 'Yoel Romero', 'Diego Sanchez', 'Benson Henderson', 'Demian Maia',
      'Leon Edwards', 'Aljamain Sterling', 'Zhang Weili', 'Paddy Pimblett', 'Stephen Thompson',
      'Derrick Lewis', 'Michael Chandler', 'Colby Covington', 'Jamahal Hill', 'Magomed Ankalaev',
      'Alexandre Pantoja', 'Brandon Moreno', 'Deiveson Figueiredo', 'Cody Garbrandt',
      'Rose Namajunas', 'Julianna Pena', 'Alexa Grasso', 'Arman Tsarukyan', 'Bo Nickal',
      'Shavkat Rakhmonov', 'Sean Strickland', 'Robert Whittaker', 'Paulo Costa', 'Jim Miller',
      'Clay Guida', 'Matt Brown', 'Rafael Dos Anjos', 'Gilbert Burns', 'Yair Rodriguez',
      'Brian Ortega', 'Movsar Evloev', 'Diego Lopes', 'Kayla Harrison', 'Mackenzie Dern',
      'Cory Sandhagen', 'Marlon Vera', 'Song Yadong',
    ],
  },
];
