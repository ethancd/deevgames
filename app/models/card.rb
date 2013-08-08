class Card < ActiveRecord::Base
  attr_accessible :dir, :game_id, :location, :player_id, :shot, :value

  belongs_to :game
  belongs_to :player, class_name: User

  validates :dir, :value, :game, :location, presence: true
  validates :dir,      inclusion: {in: %w[forward back]}
  validates :value,    inclusion: {in: [1, 2, 3]}
  validates :location, inclusion: {in: %w[deck hand played discard]}
end
