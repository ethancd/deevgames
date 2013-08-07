class Rule < ActiveRecord::Base
  attr_accessible :game, :text, :title

  validates :game, presence: true, inclusion: {in: ["njt", "blind", "hex"]}
  validates :text, :title, presence: true
end
