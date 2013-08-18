Deev Games
===

A site for my (theoretical) board game company. It features a user registration and sign-in system, an admin blog where users can make nested comments, and a JavaScript implementation of one of my board games.

Find it at <deevgames.com>!

---

Features
===
##Users

* users can sign up and log in
* users can upload an image as their avatar on the site
* users can edit their information
* users can sign up as a guest with one click, which lets them play games, but doesn't let them comment

##Posts
* admin users can add blog posts with an attached image
* all users can see these posts

##Comments
* non-guest users can add comments to a post, or to any comment on that post
* users can edit their own comments (which adds a timestamp showing their last edit)
* users can delete their own comments (which hides the text of the comment, the author, and their avatar)
* admins can edit, delete, and restore any comments

##Games
Of the three games I've designed, one is currently implemented on the site. The other two will be implemented in the future.

#### Ninja Tanks
* General
  * there is a paginated rules section explaining how the game is played
  * users can play against an AI
  * users can enter a queue to be matched up with another human player
* Game Page
  * cards rotate when clicked, and can be dragged and dropped between the deck, hand, discard pile, and playing field
  * players have hidden information that their opponent can't see, and this information is displayed differently for each user
  * games have a linear comment system that functions as a record of in-game actions and a chat box for the players

---

Technologies
===

* Ruby on Rails
  * Devise
  * Paperclip
  * Kaminari
  * ActiveModel::Serializers
  * RSpec
  * Capybara
* JavaScript
  * jQuery
  * AJAX
  * jQuery UI
  * Embedded JS
* CSS / Sass
* Heroku

---

TODO
===

* Game Creation
  * create a tutorial to better teach people how to play and control the online game
  * implement better way to play against a friend
  * create rematch button for end of a game
* Persistence
  * use YAML conversion to save game states iteratively
  * track player wins and losses
  * track player ratings (elo)
* Replays
  * searching for replays by date or player
  * add step back, step forward, and continue forward ("play") for replays
  * be able to add comments to a game at specific turns (think Soundcloud)
* Game Page
  * increase test coverage of game creation and interaction (use Jasmine for the JavaScript)
  * use jQuery UI sortable to change ordering of cards in hand, and maintain ordering and rotation across refreshes
  * create animations for moving, firing, and taking damage
  * on click/hover, make discard pile display count of each card type
  * add spinner gif for waiting during AJAX lag
  * fix minor timing bugs (double move across boundary, double shot revealing target location)
* Social
  * add OmniAuth for Facebook / Google sign in
  * add friends list
  * add group chats
* Chat
  * reimplement chat using Pusher for actual real-time interaction
* Add links to game store for physical board game copies
  * activate said game store
* Reimplement JavaScript code as Backbone for improved code organization
* Abstract jQuery logic into "card-moving" library for use between games
* Implement Blind Loyalty (second game)
* Implement Hex Strike (third game)