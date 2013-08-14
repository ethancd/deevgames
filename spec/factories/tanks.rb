# Read about factories at https://github.com/thoughtbot/factory_girl

FactoryGirl.define do
  factory :tank do
    position 2
    player_id { FactoryGirl.create(:player).id }
    game_id { FactoryGirl.create(:game).id }
    fake false
  end
end
