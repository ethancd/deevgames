class Tank < ActiveRecord::Base
  attr_accessible :fake, :game_id, :player_id, :position

  belongs_to :game
  belongs_to :player, class_name: User

  validates :game, :value, :fake, :player, presence: true
  validates :position, inclusion: {in: [1, 2, 3]}
end
