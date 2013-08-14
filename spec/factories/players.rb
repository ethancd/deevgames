# Read about factories at https://github.com/thoughtbot/factory_girl

FactoryGirl.define do
  factory :player do
    user_id { FactoryGirl.create(:user).id }
    game_id { FactoryGirl.create(:game).id }
  end
end
