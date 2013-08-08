class Card < ActiveRecord::Base
  attr_accessible :dir, :game_id, :location, :player_id, :shot, :value

  belongs_to :game
  belongs_to :player, class_name: User

  validates :dir, :value, :game, :location, presence: true
  validates :dir,      inclusion: {in: %w[forward back]}
  validates :value,    inclusion: {in: [1, 2, 3]}
  validates :location, inclusion: {in: %w[deck hand played discard]}

  def self.setup_deck(game_id)
    deck = []

    [1,2,3].each do |value|
      %w[forward back].each do |dir|
        5.times do
          deck << Card.create(game_id: game_id, value: value,
                              dir: dir, location: "deck")
        end
      end
    end

    deck
  end
end
