class DamageToken < ActiveRecord::Base
  attr_accessible :fake, :game_id, :player_id, :value

  belongs_to :game
  belongs_to :player, class_name: User

  validates :game, :value, :fake, presence: true
  validates :value, inclusion: {in: [1, 2, 3]}
end
