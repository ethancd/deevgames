class GameSerializer < ActiveModel::Serializer
  has_many :players
  has_many :cards
  has_many :damage_tokens
  has_many :comments
  has_one :winner
  has_one :loser

  attributes :phase, :result, :deck, :discard, :player

  def player
    object.players.where(user: current_user)
  end

  def deck
    object.cards.where(location: ["deck", "drawn"])
  end

  def discard
    object.cards.where(location: "discard")
  end
end