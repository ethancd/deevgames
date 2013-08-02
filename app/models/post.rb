class Post < ActiveRecord::Base
  attr_accessible :body, :image_url, :title, :author_id

  belongs_to :author, class_name: User
  has_many :comments

  validates :author, :body, :title, presence: true
end
