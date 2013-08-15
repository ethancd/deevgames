class GameSerializer < ActiveModel::Serializer
  has_many :players
  has_many :cards
  has_many :damage_tokens
  has_many :comments
  has_one :winner
  has_one :loser

  attributes :phase, :result, :deck, :discard, :player_index

  def player_index
    0 #object.players[0].user == current_user ? 0 : 1
  end

  def deck
    object.cards.where(location: ["deck", "drawn"])
  end

  def discard
    object.cards.where(location: "discard")
  end
end