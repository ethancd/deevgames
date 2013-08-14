FactoryGirl.define do
  factory :comment do |f|
    f.author_id { FactoryGirl.create(:user).id }
    f.topic_id { FactoryGirl.create(:post).id }
    f.topic_type "Post"
    f.body "I think that lorem ipsum dolor sit amet, consectetur adipisicing elit."
  end
end