class Feedback < ActiveRecord::Base
  attr_accessible :body, :topic

  validates :topic, presence: true
  validates :body, presence: true, length: {in: 50..500 }
end
