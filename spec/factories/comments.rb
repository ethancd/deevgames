FactoryGirl.define do
  factory :comment do |f|
    f.author_id "1"
    f.topic_id "1"
    f.topic_type "Post"
    f.body "Lorem ipsum dolor sit amet, consectetur adipisicing elit."
  end
end